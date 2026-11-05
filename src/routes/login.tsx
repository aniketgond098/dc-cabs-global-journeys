import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, LoaderCircle, LogOut, ShieldCheck } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getCustomerAuthClient, normalizeCustomerPhone } from "@/lib/customer-auth";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Customer Login | DC Cabs" },
      { name: "description", content: "Sign in to DC Cabs securely with a one-time SMS code." },
    ],
  }),
  component: CustomerLoginPage,
});

function CustomerLoginPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [submittedPhone, setSubmittedPhone] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [configured, setConfigured] = useState(true);

  useEffect(() => {
    const client = getCustomerAuthClient();
    if (!client) {
      setConfigured(false);
      return;
    }

    void client.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");

    const normalizedPhone = normalizeCustomerPhone(phone);
    if (!normalizedPhone) {
      setError("Enter a valid phone number with its country code, such as +91 98765 43210.");
      return;
    }

    const client = getCustomerAuthClient();
    if (!client) {
      setConfigured(false);
      return;
    }

    setBusy(true);
    try {
      const { error: requestError } = await client.auth.signInWithOtp({
        phone: normalizedPhone,
        options: { shouldCreateUser: true },
      });
      if (requestError) throw requestError;
      setSubmittedPhone(normalizedPhone);
      setOtpSent(true);
      setNotice(`A verification code was sent to ${normalizedPhone}.`);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "We couldn't send a code. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");

    const token = otp.replace(/\s/g, "");
    if (!/^\d{6}$/.test(token)) {
      setError("Enter the six-digit code from your SMS.");
      return;
    }

    const client = getCustomerAuthClient();
    if (!client) {
      setConfigured(false);
      return;
    }

    setBusy(true);
    try {
      const { data, error: verifyError } = await client.auth.verifyOtp({
        phone: submittedPhone,
        token,
        type: "sms",
      });
      if (verifyError) throw verifyError;
      setSession(data.session);
      setOtp("");
      setNotice("You're signed in to DC Cabs.");
    } catch (verifyError) {
      setError(
        verifyError instanceof Error
          ? verifyError.message
          : "That code could not be verified. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    const client = getCustomerAuthClient();
    if (!client) return;
    setBusy(true);
    setError("");
    try {
      const { error: signOutError } = await client.auth.signOut();
      if (signOutError) throw signOutError;
      setOtpSent(false);
      setSubmittedPhone("");
      setPhone("");
      setNotice("You have signed out.");
    } catch (signOutError) {
      setError(
        signOutError instanceof Error
          ? signOutError.message
          : "We couldn't sign you out. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="min-h-[75vh] px-4 pb-24 pt-36 md:pt-44">
      <div className="mx-auto grid max-w-6xl overflow-hidden border border-border bg-charcoal/70 lg:grid-cols-[1fr_0.8fr]">
        <div className="border-b border-border p-7 md:p-12 lg:border-b-0 lg:border-r">
          <p className="eyebrow mb-5 flex items-center gap-3 text-primary">
            <span className="h-px w-8 bg-primary" /> Customer access
          </p>
          <h1 className="font-display text-4xl font-extrabold uppercase leading-tight sm:text-5xl">
            Welcome <span className="text-foreground/40">back.</span>
          </h1>
          <p className="mt-5 max-w-xl text-sm leading-7 text-muted-foreground md:text-base">
            Sign in with your mobile number. We’ll send a one-time code by SMS—no password to
            remember.
          </p>
          <div className="mt-8 flex items-start gap-3 border border-border bg-background/50 p-4 text-sm text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            <p>Your number is verified by a one-time code. Never share that code with anyone.</p>
          </div>
        </div>

        <div className="p-7 md:p-12">
          {session ? (
            <div className="space-y-6" aria-live="polite">
              <p className="eyebrow text-primary">Signed in</p>
              <h2 className="font-display text-2xl font-bold uppercase">You’re all set.</h2>
              <p className="text-sm text-muted-foreground">
                Signed in as {session.user.phone ?? "your verified phone number"}.
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => void signOut()}
                disabled={busy}
              >
                {busy ? (
                  <LoaderCircle className="mr-2 size-4 animate-spin" />
                ) : (
                  <LogOut className="mr-2 size-4" />
                )}
                Sign out
              </Button>
            </div>
          ) : !configured ? (
            <div role="status" className="space-y-3 border-l-2 border-primary pl-4">
              <h2 className="font-display text-xl font-bold uppercase">Login setup required</h2>
              <p className="text-sm leading-6 text-muted-foreground">
                Customer login needs the public Supabase URL and publishable key in the site’s build
                environment. No secret key belongs in these browser settings.
              </p>
            </div>
          ) : otpSent ? (
            <form className="space-y-5" onSubmit={verifyCode}>
              <div>
                <p className="eyebrow text-primary">Verify your phone</p>
                <h2 className="mt-2 font-display text-2xl font-bold uppercase">Enter your code</h2>
                <p className="mt-2 text-sm text-muted-foreground">SMS sent to {submittedPhone}.</p>
              </div>
              <label className="block space-y-2 text-sm font-medium" htmlFor="customer-otp">
                Six-digit verification code
                <Input
                  id="customer-otp"
                  name="otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9 ]*"
                  maxLength={7}
                  value={otp}
                  onChange={(event) => setOtp(event.target.value)}
                  placeholder="123456"
                  required
                />
              </label>
              <Button className="w-full" type="submit" disabled={busy}>
                {busy ? (
                  <LoaderCircle className="mr-2 size-4 animate-spin" />
                ) : (
                  <ArrowRight className="mr-2 size-4" />
                )}
                Verify &amp; sign in
              </Button>
              <button
                type="button"
                className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
                onClick={() => {
                  setOtpSent(false);
                  setOtp("");
                  setError("");
                  setNotice("");
                }}
              >
                Change phone number
              </button>
            </form>
          ) : (
            <form className="space-y-5" onSubmit={requestCode}>
              <div>
                <p className="eyebrow text-primary">One-time SMS code</p>
                <h2 className="mt-2 font-display text-2xl font-bold uppercase">
                  Sign in with phone
                </h2>
              </div>
              <label className="block space-y-2 text-sm font-medium" htmlFor="customer-phone">
                Phone number
                <Input
                  id="customer-phone"
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="+91 98765 43210"
                  required
                />
              </label>
              <Button className="w-full" type="submit" disabled={busy}>
                {busy ? (
                  <LoaderCircle className="mr-2 size-4 animate-spin" />
                ) : (
                  <ArrowRight className="mr-2 size-4" />
                )}
                Send verification code
              </Button>
              <p className="text-xs leading-5 text-muted-foreground">
                New customers can create an account by verifying their phone number.
              </p>
            </form>
          )}

          {error && (
            <p
              role="alert"
              className="mt-5 border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="mt-5 text-sm text-muted-foreground">
              {notice}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
