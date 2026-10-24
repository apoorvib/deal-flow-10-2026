"""Locks in the SEC 506(c) audit guarantees of the persistence layer.

Each test maps to one of the "reasonable steps" properties we rely on:
- audit_logs is append-only (ORM hooks and Postgres triggers);
- audit entries survive a rollback of the main transaction;
- the audit hash chain detects tampering;
- raw document text is encrypted at rest and never loaded by default;
- foreign keys refuse to delete history;
- integrity constraints reject malformed attempts.
"""

import hashlib
import uuid
from decimal import Decimal

import pytest
from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError, IntegrityError

import models
from database import SessionLocal, audit_session
from models import (
    AttemptStatus,
    AuditLog,
    AuditLogImmutableError,
    Fund,
    Investor,
    InvestorType,
    Offering,
    Pathway,
    VerificationAttempt,
    append_audit_log,
    compute_entry_hash,
)

DOC_TEXT = (
    "SYNTHETIC SPECIMEN - NOT A REAL DOCUMENT. Form 1040 tax year 2025. "
    "SSN 123-45-6789. Adjusted gross income $412,500.00"
)


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #


def make_investor(db, email="jane@example.com", **kw) -> Investor:
    inv = Investor(
        legal_name=kw.pop("legal_name", "Jane Specimen"),
        email=email,
        country="US",
        investor_type=kw.pop("investor_type", InvestorType.INDIVIDUAL),
        **kw,
    )
    db.add(inv)
    db.flush()
    return inv


def make_fund(db) -> Fund:
    fund = Fund(
        name="Meridian Seed Fund II",
        manager="Meridian Partners",
        strategy="Seed",
        offering=Offering.RULE_506C,
        min_check=Decimal("25000.00"),
    )
    db.add(fund)
    db.flush()
    return fund


def make_attempt(db, investor, fund=None, doc=DOC_TEXT, **kw) -> VerificationAttempt:
    att = VerificationAttempt(
        investor_id=investor.id,
        fund_id=fund.id if fund else None,
        pathway=kw.pop("pathway", Pathway.INCOME),
        extracted_figures=kw.pop(
            "extracted_figures",
            {"income": {"value": "412500.00", "sourceQuote": "Adjusted gross income $412,500.00", "found": True}},
        ),
        raw_document_text=doc,
        raw_document_sha256=kw.pop("raw_document_sha256", hashlib.sha256(doc.encode()).hexdigest()),
        **kw,
    )
    db.add(att)
    db.flush()
    return att


def seed_attempt():
    """Commit an investor + fund + attempt; return their ids."""
    with SessionLocal() as db:
        inv = make_investor(db)
        fund = make_fund(db)
        att = make_attempt(db, inv, fund)
        db.commit()
        return inv.id, fund.id, att.id


def write_audit(event_type="payload_received", **kw) -> int:
    with audit_session() as adb:
        entry = append_audit_log(
            adb, event_type=event_type, actor=kw.pop("actor", "system"), payload=kw.pop("payload", {"k": "v"}), **kw
        )
        return entry.id


def audit_count(engine, where="TRUE", **params) -> int:
    with engine.connect() as c:
        return c.execute(text(f"SELECT count(*) FROM audit_logs WHERE {where}"), params).scalar_one()


def recompute(row: AuditLog) -> str:
    return compute_entry_hash(
        row.prev_hash,
        {
            "verification_attempt_id": str(row.verification_attempt_id) if row.verification_attempt_id else None,
            "investor_id": str(row.investor_id) if row.investor_id else None,
            "event_type": row.event_type,
            "actor": row.actor,
            "payload": row.payload,
            "created_at": row.created_at.isoformat(),
        },
    )


# --------------------------------------------------------------------------- #
# Test isolation
# --------------------------------------------------------------------------- #


def test_runs_against_isolated_test_database(engine):
    assert engine.url.database.endswith("_test")
    with engine.connect() as c:
        assert c.execute(text("SELECT current_database()")).scalar_one().endswith("_test")


# --------------------------------------------------------------------------- #
# Audit trigger: Postgres blocks mutation even via raw SQL
# --------------------------------------------------------------------------- #


def test_audit_triggers_are_installed(engine):
    with engine.connect() as c:
        names = set(
            c.execute(
                text(
                    "SELECT tgname FROM pg_trigger "
                    "WHERE tgrelid = 'audit_logs'::regclass AND NOT tgisinternal AND tgenabled = 'O'"
                )
            ).scalars()
        )
    assert names == {"audit_logs_no_update_delete", "audit_logs_no_truncate"}


@pytest.mark.parametrize(
    "sql, op",
    [
        ("UPDATE audit_logs SET actor = 'tampered'", "UPDATE"),
        ("UPDATE audit_logs SET payload = '{}'::jsonb, entry_hash = repeat('0', 64)", "UPDATE"),
        ("DELETE FROM audit_logs", "DELETE"),
        ("TRUNCATE audit_logs", "TRUNCATE"),
        ("TRUNCATE audit_logs CASCADE", "TRUNCATE"),
    ],
)
def test_raw_sql_mutation_of_audit_logs_is_blocked(engine, sql, op):
    write_audit()
    with pytest.raises(DBAPIError) as exc:
        with engine.begin() as c:
            c.execute(text(sql))
    assert f"audit_logs is append-only: {op} is not allowed" in str(exc.value.orig)
    assert exc.value.orig.pgcode == "42501"  # insufficient_privilege
    assert audit_count(engine, "actor = 'system'") == 1


def test_trigger_blocks_mutation_on_empty_table_truncate(engine):
    # TRUNCATE is a statement-level trigger: blocked even with zero rows.
    with pytest.raises(DBAPIError, match="append-only: TRUNCATE"):
        with engine.begin() as c:
            c.execute(text("TRUNCATE audit_logs"))


def test_insert_is_still_allowed(engine):
    write_audit()
    write_audit()
    assert audit_count(engine) == 2


# --------------------------------------------------------------------------- #
# ORM layer: hooks block update/delete before SQL is even sent
# --------------------------------------------------------------------------- #


def test_orm_update_of_audit_log_is_blocked(engine):
    entry_id = write_audit()
    with SessionLocal() as db:
        row = db.get(AuditLog, entry_id)
        row.actor = "tampered"
        with pytest.raises(AuditLogImmutableError, match="UPDATE"):
            db.commit()
    with SessionLocal() as db:
        assert db.get(AuditLog, entry_id).actor == "system"


def test_orm_delete_of_audit_log_is_blocked(engine):
    entry_id = write_audit()
    with SessionLocal() as db:
        db.delete(db.get(AuditLog, entry_id))
        with pytest.raises(AuditLogImmutableError, match="DELETE"):
            db.commit()
    assert audit_count(engine) == 1


def test_orm_bulk_update_bypassing_hooks_is_still_caught_by_trigger(engine):
    """Bulk query updates skip ORM events; the database trigger is the backstop."""
    write_audit()
    with SessionLocal() as db:
        with pytest.raises(DBAPIError, match="append-only: UPDATE"):
            db.execute(AuditLog.__table__.update().values(actor="tampered"))
            db.commit()


# --------------------------------------------------------------------------- #
# Audit rollback: rejected attempts must leave an immutable record
# --------------------------------------------------------------------------- #


def test_audit_entry_survives_main_transaction_rollback(engine):
    inv_id, _, att_id = seed_attempt()

    main = SessionLocal()
    try:
        make_investor(main, email="ghost@example.com", legal_name="Ghost")
        write_audit(
            event_type="quote_mismatch",
            payload={"field": "income", "sourceQuote": "Adjusted gross income $999,999.00"},
            verification_attempt_id=att_id,
            investor_id=inv_id,
        )
        main.rollback()
    finally:
        main.close()

    with engine.connect() as c:
        assert c.execute(text("SELECT count(*) FROM investors WHERE email = 'ghost@example.com'")).scalar_one() == 0
    assert audit_count(engine, "event_type = 'quote_mismatch'") == 1


def test_audit_entry_survives_exception_in_request_handler(engine):
    """Simulates the real flow: audit first, then the handler raises and its session rolls back."""
    inv_id, _, att_id = seed_attempt()

    class QuoteMismatch(Exception):
        pass

    with pytest.raises(QuoteMismatch):
        with SessionLocal() as main:
            try:
                main.get(VerificationAttempt, att_id).status = AttemptStatus.EVALUATED
                write_audit(event_type="quote_mismatch", verification_attempt_id=att_id, investor_id=inv_id)
                raise QuoteMismatch("sourceQuote not in rawDocumentText")
            except QuoteMismatch:
                main.rollback()
                raise

    with SessionLocal() as db:
        assert db.get(VerificationAttempt, att_id).status is AttemptStatus.RECEIVED
    assert audit_count(engine, "event_type = 'quote_mismatch'") == 1


def test_audit_session_rolls_back_its_own_failed_write(engine):
    """A failing audit write must not leave a half-written entry or break the chain."""
    with pytest.raises(IntegrityError):
        write_audit(verification_attempt_id=uuid.uuid4())  # FK to a non-existent attempt
    assert audit_count(engine) == 0
    write_audit()
    with SessionLocal() as db:
        (row,) = db.scalars(select(AuditLog)).all()
    assert row.prev_hash is None


# --------------------------------------------------------------------------- #
# Hash chain: tampering is detectable
# --------------------------------------------------------------------------- #


def test_hash_chain_links_and_recomputes(engine):
    inv_id, _, att_id = seed_attempt()
    write_audit(event_type="payload_received", verification_attempt_id=att_id, investor_id=inv_id)
    write_audit(event_type="quote_verified", payload={"checks": 3}, verification_attempt_id=att_id)
    write_audit(event_type="rule_evaluated", payload={"decision": "approved"}, verification_attempt_id=att_id)

    with SessionLocal() as db:
        rows = db.scalars(select(AuditLog).order_by(AuditLog.id)).all()

    assert rows[0].prev_hash is None
    for prev, cur in zip(rows, rows[1:]):
        assert cur.prev_hash == prev.entry_hash
    for row in rows:
        assert len(row.entry_hash) == 64
        assert recompute(row) == row.entry_hash


def test_hash_chain_detects_altered_payload(engine):
    write_audit(payload={"decision": "denied"})
    with SessionLocal() as db:
        row = db.scalars(select(AuditLog)).one()
    row.payload = {"decision": "approved"}  # in-memory forgery, never persisted
    assert recompute(row) != row.entry_hash


def test_entry_hash_is_unique(engine):
    write_audit()
    with SessionLocal() as db:
        existing = db.scalars(select(AuditLog)).one().entry_hash
    with pytest.raises(IntegrityError):
        with engine.begin() as c:
            c.execute(
                text(
                    "INSERT INTO audit_logs (event_type, actor, payload, entry_hash) "
                    "VALUES ('forged', 'x', '{}'::jsonb, :h)"
                ),
                {"h": existing},
            )


# --------------------------------------------------------------------------- #
# Encryption at rest
# --------------------------------------------------------------------------- #


def test_raw_document_text_is_ciphertext_in_postgres(engine):
    _, _, att_id = seed_attempt()
    with engine.connect() as c:
        stored = c.execute(
            text("SELECT raw_document_text FROM verification_attempts WHERE id = :i"), {"i": att_id}
        ).scalar_one()
    assert stored.startswith("gAAAAA")  # Fernet token
    assert "123-45-6789" not in stored
    assert "412,500" not in stored
    assert stored != DOC_TEXT


def test_orm_decrypts_raw_document_text(engine):
    _, _, att_id = seed_attempt()
    with SessionLocal() as db:
        assert db.get(VerificationAttempt, att_id).raw_document_text == DOC_TEXT


def test_raw_document_text_is_deferred(engine):
    _, _, att_id = seed_attempt()
    with SessionLocal() as db:
        att = db.get(VerificationAttempt, att_id)
        assert "raw_document_text" not in att.__dict__
        _ = att.raw_document_text
        assert "raw_document_text" in att.__dict__


def test_same_plaintext_encrypts_to_different_ciphertext(engine):
    with SessionLocal() as db:
        inv = make_investor(db)
        a1, a2 = make_attempt(db, inv), make_attempt(db, inv)
        db.commit()
        ids = (a1.id, a2.id)
    with engine.connect() as c:
        tokens = c.execute(
            text("SELECT raw_document_text FROM verification_attempts WHERE id = ANY(:ids)"), {"ids": list(ids)}
        ).scalars().all()
    assert len(set(tokens)) == 2  # random IV: equal documents aren't linkable


def test_tampered_ciphertext_fails_loudly(engine):
    _, _, att_id = seed_attempt()
    # Flip one character inside the ciphertext body. (Appending to the token would
    # not work: base64 decoding ignores data after "=" padding, so the bytes the
    # HMAC covers would be unchanged.)
    with engine.begin() as c:
        token = c.execute(
            text("SELECT raw_document_text FROM verification_attempts WHERE id = :i"), {"i": att_id}
        ).scalar_one()
        mid = len(token) // 2
        forged = token[:mid] + ("A" if token[mid] != "A" else "B") + token[mid + 1:]
        c.execute(
            text("UPDATE verification_attempts SET raw_document_text = :t WHERE id = :i"),
            {"t": forged, "i": att_id},
        )
    with SessionLocal() as db:
        att = db.get(VerificationAttempt, att_id)
        with pytest.raises(InvalidToken):
            _ = att.raw_document_text


def test_wrong_key_cannot_decrypt():
    token = models.EncryptedText().process_bind_param(DOC_TEXT, None)
    with pytest.raises(InvalidToken):
        Fernet(Fernet.generate_key()).decrypt(token.encode())


def test_unicode_and_large_document_round_trip(engine):
    doc = "Revenu imposable: 412 500,00 € — 東京 ✓\n" * 20_000  # ~0.8 MB
    with SessionLocal() as db:
        inv = make_investor(db)
        att = make_attempt(db, inv, doc=doc)
        db.commit()
        att_id = att.id
    with SessionLocal() as db:
        assert db.get(VerificationAttempt, att_id).raw_document_text == doc


def test_null_round_trip_on_encrypted_type():
    t = models.EncryptedText()
    assert t.process_bind_param(None, None) is None
    assert t.process_result_value(None, None) is None


# --------------------------------------------------------------------------- #
# Foreign keys: history can't be deleted out from under the audit trail
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    "table, id_index",
    [("investors", 0), ("funds", 1), ("verification_attempts", 2)],
)
def test_delete_restricted_when_audit_history_exists(engine, table, id_index):
    ids = seed_attempt()
    write_audit(verification_attempt_id=ids[2], investor_id=ids[0])
    with pytest.raises(IntegrityError, match="foreign key"):
        with engine.begin() as c:
            c.execute(text(f"DELETE FROM {table} WHERE id = :i"), {"i": ids[id_index]})


def test_orm_delete_does_not_cascade(engine):
    inv_id, _, _ = seed_attempt()
    with SessionLocal() as db:
        db.delete(db.get(Investor, inv_id))
        with pytest.raises(IntegrityError):
            db.commit()
    with engine.connect() as c:
        assert c.execute(text("SELECT count(*) FROM verification_attempts")).scalar_one() == 1


def test_attempt_fund_id_is_optional(engine):
    with SessionLocal() as db:
        inv = make_investor(db)
        att = make_attempt(db, inv, fund=None)
        db.commit()
        assert att.fund_id is None


def test_relationships_navigate_both_ways(engine):
    inv_id, fund_id, att_id = seed_attempt()
    write_audit(verification_attempt_id=att_id, investor_id=inv_id)
    with SessionLocal() as db:
        att = db.get(VerificationAttempt, att_id)
        assert att.investor.id == inv_id and att.fund.id == fund_id
        assert [a.id for a in db.get(Investor, inv_id).attempts] == [att_id]
        assert [a.id for a in db.get(Fund, fund_id).attempts] == [att_id]
        assert len(att.audit_logs) == 1 and att.audit_logs[0].investor.id == inv_id


# --------------------------------------------------------------------------- #
# Integrity constraints
# --------------------------------------------------------------------------- #


def _expect_integrity(db, constraint: str, **attempt_kw):
    inv = make_investor(db)
    with pytest.raises(IntegrityError, match=constraint):
        make_attempt(db, inv, **attempt_kw)
    db.rollback()


def test_rejected_status_requires_reason(db):
    _expect_integrity(db, "rejection_reason_iff_rejected", status=AttemptStatus.REJECTED_QUOTE_MISMATCH)


def test_reason_only_allowed_when_rejected(db):
    _expect_integrity(db, "rejection_reason_iff_rejected", rejection_reason="not rejected though")


def test_rejected_attempt_with_reason_is_valid(db):
    inv = make_investor(db)
    att = make_attempt(
        db, inv, status=AttemptStatus.REJECTED_QUOTE_MISMATCH,
        rejection_reason="sourceQuote for income not found in rawDocumentText",
    )
    db.commit()
    assert att.status is AttemptStatus.REJECTED_QUOTE_MISMATCH


def test_reviewer_and_timestamp_must_be_set_together(db):
    _expect_integrity(db, "review_pair", reviewed_by="cpa@example.com")


def test_sha256_must_be_lowercase_hex(db):
    _expect_integrity(db, "sha256_hex", raw_document_sha256="Z" * 64)


def test_raw_document_text_is_required(db):
    inv = make_investor(db)
    db.add(VerificationAttempt(
        investor_id=inv.id, pathway=Pathway.INCOME, extracted_figures={},
        raw_document_text=None, raw_document_sha256="0" * 64,
    ))
    with pytest.raises(IntegrityError, match="raw_document_text"):
        db.flush()


def test_investor_email_is_unique(db):
    make_investor(db)
    with pytest.raises(IntegrityError, match="uq_investors_email"):
        make_investor(db)


def test_entity_investor_requires_entity_fields(db):
    with pytest.raises(IntegrityError, match="entity_fields_match_type"):
        make_investor(db, investor_type=InvestorType.ENTITY)


def test_individual_investor_rejects_entity_fields(db):
    with pytest.raises(IntegrityError, match="entity_fields_match_type"):
        make_investor(db, entity_name="Specimen Holdings LLC", entity_kind=models.EntityKind.LLC)


def test_fund_min_check_cannot_be_negative(db):
    db.add(Fund(name="F", manager="M", strategy="S", offering=Offering.RULE_506C, min_check=Decimal("-1")))
    with pytest.raises(IntegrityError, match="min_check_non_negative"):
        db.flush()


def test_money_is_exact_decimal(db):
    fund = Fund(name="F", manager="M", strategy="S", offering=Offering.RULE_506C, min_check=Decimal("199999.99"))
    db.add(fund)
    db.commit()
    db.expire_all()
    assert db.get(Fund, fund.id).min_check == Decimal("199999.99")


def test_enums_store_contract_values(engine):
    seed_attempt()
    with engine.connect() as c:
        row = c.execute(text(
            "SELECT f.offering::text, a.pathway::text, a.status::text "
            "FROM verification_attempts a JOIN funds f ON f.id = a.fund_id"
        )).one()
    assert tuple(row) == ("506(c)", "income", "received")


def test_server_generates_ids_and_timestamps(engine):
    _, _, att_id = seed_attempt()
    write_audit()
    with SessionLocal() as db:
        att = db.get(VerificationAttempt, att_id)
        entry = db.scalars(select(AuditLog)).one()
    assert isinstance(att.id, uuid.UUID) and att.id.version == 4
    assert att.created_at.tzinfo is not None
    assert entry.created_at.tzinfo is not None
