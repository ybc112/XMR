import React from 'react'

export default function Input({
  label,
  value,
  onChange,
  placeholder = '',
  type = 'text',
  disabled = false,
  className = '',
  suffix,
  prefix,
  error,
  hint,
  ...rest
}) {
  return (
    <div className={`input-group ${className}`}>
      {label && <label className="input-label">{label}</label>}
      <div className={`input-wrapper ${error ? 'input-error' : ''}`}>
        {prefix && <span className="input-prefix">{prefix}</span>}
        <input
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          className="input-field"
          {...rest}
        />
        {suffix && <span className="input-suffix">{suffix}</span>}
      </div>
      {error && <span className="input-error-text">{error}</span>}
      {hint && !error && <span className="input-hint">{hint}</span>}
    </div>
  )
}
