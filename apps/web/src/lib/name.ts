// The one number both the field and the server agree on.
//
// `maxLength` on the input stops sixty-one characters being typed rather than
// letting them be typed and refused, which is the difference between a limit
// and an error message. The server still checks: a client is not a validator.
export const NAME_MAX = 60;
