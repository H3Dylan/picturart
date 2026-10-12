import { type InputHTMLAttributes, useId } from 'react';
import ui from './ui.module.css';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string | undefined;
}

export function TextField({ label, hint, error, ...input }: TextFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className={ui.field}>
      <label htmlFor={id} className={ui.label}>
        {label}
        {hint && <span className={ui.hint}> · {hint}</span>}
      </label>
      <input
        id={id}
        className={ui.input}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...input}
      />
      {error && (
        <p id={errorId} className={ui.fieldError}>
          {error}
        </p>
      )}
    </div>
  );
}
