import { AuthForm } from "@/components/auth-form";
import { Field, Input, PageTitle } from "@/components/ui";
import { updatePassword } from "../actions";

export default function ResetPasswordPage() {
  return (
    <>
      <PageTitle>Choose a new password</PageTitle>
      <div className="mt-6">
        <AuthForm action={updatePassword} submitLabel="Save password">
          <Field label="New password" hint="At least 10 characters.">
            <Input name="password" type="password" autoComplete="new-password" minLength={10} maxLength={72} required />
          </Field>
        </AuthForm>
      </div>
    </>
  );
}
