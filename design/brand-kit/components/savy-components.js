/* @ds-bundle: {"format":4,"namespace":"Savy","components":[{"name":"Button"},{"name":"StatusBadge"},{"name":"TextField"},{"name":"PassportCard"}]} */
(function () {
  var React = window.React;
  var h = React.createElement;

  function cx() {
    return Array.prototype.filter.call(arguments, Boolean).join(' ');
  }

  function omit(obj, keys) {
    var out = {};
    for (var k in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, k) && keys.indexOf(k) === -1) out[k] = obj[k];
    }
    return out;
  }

  function Button(props) {
    var variant = props.variant || 'secondary';
    var size = props.size || 'md';
    var rest = omit(props, ['variant', 'size', 'className', 'children']);
    return h(
      'button',
      Object.assign({ type: 'button' }, rest, {
        className: cx('sv-btn', 'sv-btn-' + variant, 'sv-btn-' + size, props.className)
      }),
      props.children
    );
  }

  var STATUS_LABELS = {
    verified: 'Verified',
    pending: 'In review',
    needs_info: 'Needs info',
    expired: 'Expired',
    denied: 'Not verified'
  };

  function StatusBadge(props) {
    var status = props.status || 'pending';
    return h(
      'span',
      { className: cx('sv-badge', 'sv-badge-' + status, props.className) },
      h('span', { className: 'sv-badge-dot', 'aria-hidden': 'true' }),
      props.children || STATUS_LABELS[status]
    );
  }

  function TextField(props) {
    var autoId = React.useId();
    var id = props.id || autoId;
    var hintId = id + '-hint';
    var errorId = id + '-error';
    var describedBy = [props.hint ? hintId : null, props.error ? errorId : null].filter(Boolean).join(' ') || undefined;
    var rest = omit(props, ['label', 'hint', 'error', 'id', 'className']);
    return h(
      'div',
      { className: cx('sv-field', props.error && 'sv-field-invalid', props.className) },
      h('label', { className: 'sv-field-label', htmlFor: id }, props.label),
      h(
        'input',
        Object.assign({}, rest, {
          id: id,
          className: 'sv-field-input',
          'aria-invalid': props.error ? 'true' : undefined,
          'aria-describedby': describedBy
        })
      ),
      props.hint && !props.error ? h('p', { className: 'sv-field-hint', id: hintId }, props.hint) : null,
      props.error ? h('p', { className: 'sv-field-error', id: errorId }, props.error) : null
    );
  }

  function Row(label, value, mono) {
    return h(
      'div',
      { className: 'sv-pass-row' },
      h('dt', null, label),
      h('dd', { className: mono ? 'sv-mono' : undefined }, value)
    );
  }

  function PassportCard(props) {
    var status = props.status || 'verified';
    return h(
      'article',
      { className: cx('sv-pass', props.className), 'aria-label': 'Accreditation passport for ' + props.name },
      h(
        'header',
        { className: 'sv-pass-head' },
        h('p', { className: 'sv-pass-eyebrow' }, 'Accreditation passport'),
        h(StatusBadge, { status: status })
      ),
      h('h3', { className: 'sv-pass-name' }, props.name),
      props.investorType ? h('p', { className: 'sv-pass-type' }, props.investorType) : null,
      h(
        'dl',
        { className: 'sv-pass-grid' },
        props.path ? Row('Path', props.path) : null,
        props.verifiedOn ? Row('Verified on', props.verifiedOn) : null,
        props.expiresOn ? Row('Expires', props.expiresOn) : null,
        props.reviewer ? Row('Signed by', props.reviewer) : null,
        props.passportId ? Row('Passport ID', props.passportId, true) : null
      ),
      typeof props.sharedWith === 'number'
        ? h(
            'footer',
            { className: 'sv-pass-foot' },
            'Shared with ' + props.sharedWith + (props.sharedWith === 1 ? ' issuer' : ' issuers')
          )
        : null
    );
  }

  window.Savy = Object.assign(window.Savy || {}, {
    Button: Button,
    StatusBadge: StatusBadge,
    TextField: TextField,
    PassportCard: PassportCard
  });
})();
