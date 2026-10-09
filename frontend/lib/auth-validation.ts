export interface SignUpValues {
  username: string;
  email: string;
  password: string;
  password2: string;
}

export type SignUpField = keyof SignUpValues;
export type SignUpProblem = 'required' | 'invalidEmail' | 'passwordMismatch';
export type SignUpErrors = Partial<Record<SignUpField, SignUpProblem>>;

// Same shape the browser accepts for type="email": something@something.tld
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The checks the register form does before sending (required fields, valid
 * email, matching passwords). The server validates again, including password
 * strength and whether the username or email is taken.
 */
export function validateSignUp(values: SignUpValues): SignUpErrors {
  const errors: SignUpErrors = {};
  if (!values.username.trim()) errors.username = 'required';
  if (!values.email.trim()) errors.email = 'required';
  else if (!EMAIL_PATTERN.test(values.email.trim())) errors.email = 'invalidEmail';
  if (!values.password) errors.password = 'required';
  if (!values.password2) errors.password2 = 'required';
  else if (values.password !== values.password2) errors.password2 = 'passwordMismatch';
  return errors;
}
