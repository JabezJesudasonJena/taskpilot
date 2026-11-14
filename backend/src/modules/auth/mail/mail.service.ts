export abstract class MailService {
  abstract sendPasswordResetEmail(email: string, token: string): Promise<void>;
  abstract sendVerificationEmail(email: string, token: string): Promise<void>;
}
