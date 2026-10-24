import type * as React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary: the one action the screen exists for. secondary (default): everything else. ghost: inline and tertiary. danger: destructive only. */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  /** md (default, 40px), sm (32px) for tables and toolbars, lg (48px) for marketing and the final step of a flow. */
  size?: 'sm' | 'md' | 'lg';
}
export declare function Button(props: ButtonProps): React.ReactElement;

export type VerificationStatus = 'verified' | 'pending' | 'needs_info' | 'expired' | 'denied';
export interface StatusBadgeProps {
  status?: VerificationStatus;
  /** Overrides the default label. Keep it to one or two words. */
  children?: React.ReactNode;
  className?: string;
}
export declare function StatusBadge(props: StatusBadgeProps): React.ReactElement;

export interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Helper text under the field; hidden while an error shows. */
  hint?: string;
  /** Error message; sets aria-invalid and replaces the hint. */
  error?: string;
}
export declare function TextField(props: TextFieldProps): React.ReactElement;

export interface PassportCardProps {
  name: string;
  /** e.g. "Individual", "Joint", "LLC (look-through)", "Revocable trust". */
  investorType?: string;
  status?: VerificationStatus;
  /** e.g. "Net worth", "Income", "Series 65", "Minimum investment". */
  path?: string;
  verifiedOn?: string;
  expiresOn?: string;
  /** Licensed reviewer who signed the letter. */
  reviewer?: string;
  passportId?: string;
  sharedWith?: number;
  className?: string;
}
export declare function PassportCard(props: PassportCardProps): React.ReactElement;

declare global {
  interface Window {
    Savy: {
      Button: typeof Button;
      StatusBadge: typeof StatusBadge;
      TextField: typeof TextField;
      PassportCard: typeof PassportCard;
    };
  }
}
