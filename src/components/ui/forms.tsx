import { cloneElement, isValidElement, useId, type InputHTMLAttributes, type LabelHTMLAttributes, type ReactElement, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "./cn";

const control =
  "w-full rounded-md border bg-surface px-3 text-sm text-fg placeholder:text-subtle transition-colors hover:border-line-strong focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-surface-2 disabled:opacity-60";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export function Input({ invalid, className, type = "text", ...rest }: InputProps) {
  return (
    <input
      type={type}
      aria-invalid={invalid || undefined}
      className={cn(control, "h-9", invalid ? "border-danger" : "border-line-strong", className)}
      {...rest}
    />
  );
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export function Textarea({ invalid, className, rows = 4, ...rest }: TextareaProps) {
  return (
    <textarea
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(control, "py-2 leading-relaxed", invalid ? "border-danger" : "border-line-strong", className)}
      {...rest}
    />
  );
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

/** Native select with a custom chevron. Pass `<option>` children. */
export function Select({ invalid, className, children, ...rest }: SelectProps) {
  return (
    <div className="relative">
      <select
        aria-invalid={invalid || undefined}
        className={cn(control, "h-9 appearance-none pr-8", invalid ? "border-danger" : "border-line-strong", className)}
        {...rest}
      >
        {children}
      </select>
      <svg aria-hidden viewBox="0 0 20 20" className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="m6 8 4 4 4-4" />
      </svg>
    </div>
  );
}

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: ReactNode;
  description?: ReactNode;
}

export function Checkbox({ label, description, className, id, ...rest }: CheckboxProps) {
  const auto = useId();
  const cid = id ?? auto;
  return (
    <div className={cn("flex items-start gap-2.5", className)}>
      <input id={cid} type="checkbox" className="mt-0.5 size-4 shrink-0 rounded border-line-strong accent-accent" {...rest} />
      {label || description ? (
        <label htmlFor={cid} className="min-w-0 cursor-pointer">
          {label ? <span className="block text-sm text-fg">{label}</span> : null}
          {description ? <span className="block text-[13px] text-muted">{description}</span> : null}
        </label>
      ) : null}
    </div>
  );
}

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "role"> {
  label?: ReactNode;
  description?: ReactNode;
}

/** CSS-only toggle built on a checkbox (role="switch"): works in server components and plain forms. */
export function Switch({ label, description, className, id, ...rest }: SwitchProps) {
  const auto = useId();
  const sid = id ?? auto;
  return (
    <div className={cn("flex items-start gap-3", className)}>
      <span className="relative mt-0.5 inline-flex h-5 w-9 shrink-0">
        <input id={sid} type="checkbox" role="switch" className="peer absolute inset-0 z-10 m-0 size-full cursor-pointer appearance-none rounded-full" {...rest} />
        <span aria-hidden className="absolute inset-0 rounded-full bg-surface-3 transition-colors peer-checked:bg-accent peer-disabled:opacity-50 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface" />
        <span aria-hidden className="absolute left-0.5 top-0.5 size-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
      </span>
      {label || description ? (
        <label htmlFor={sid} className="min-w-0 cursor-pointer">
          {label ? <span className="block text-sm text-fg">{label}</span> : null}
          {description ? <span className="block text-[13px] text-muted">{description}</span> : null}
        </label>
      ) : null}
    </div>
  );
}

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
}

export function Label({ required, className, children, ...rest }: LabelProps) {
  return (
    <label className={cn("block text-[13px] font-medium text-fg", className)} {...rest}>
      {children}
      {required ? <span aria-hidden className="ml-0.5 text-danger">*</span> : null}
    </label>
  );
}

export interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  /** A single form control; it receives id, aria-describedby and aria-invalid automatically. */
  children: ReactNode;
  className?: string;
}

/** Label + control + hint/error: `<Field label="Name" hint="Shown to clients"><Input name="name" /></Field>` */
export function Field({ label, hint, error, required, children, className }: FieldProps) {
  const auto = useId();
  let id = auto;
  let node = children;
  if (isValidElement(children)) {
    const el = children as ReactElement<Record<string, unknown>>;
    id = (el.props.id as string | undefined) ?? auto;
    const describedBy = [hint && !error ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
    node = cloneElement(el, { id, "aria-describedby": describedBy, ...(error ? { invalid: true } : {}) });
  }
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      {node}
      {hint && !error ? (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
