import { useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { Profile, SignupStatusResponse } from "@/api/types";
import { getBootstrapProfile, useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/PasswordInput";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useServerBranding } from "@/hooks/useServerBranding";
import { AuthBackground } from "@/components/auth/AuthBackground";
import { sanitizeAuthRedirect } from "@/lib/authRedirect";
import { toast } from "@/i18n/toast";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

export default function Signup() {
  useUILanguage();
  const [searchParams] = useSearchParams();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [inviteCode, setInviteCode] = useState(searchParams.get("code") ?? "");
  const [submitting, setSubmitting] = useState(false);
  const { signup, profile, selectProfile, user, loading } = useAuth();
  const navigate = useNavigate();
  const { serverName } = useServerBranding();
  const redirectTarget = sanitizeAuthRedirect(searchParams.get("redirect"));

  const statusQuery = useQuery({
    queryKey: ["auth", "signup-status"],
    queryFn: () => api<SignupStatusResponse>("/auth/signup"),
  });

  if (loading || statusQuery.isPending) {
    return (
      <div className="auth-shell">
        <div className="border-primary h-8 w-8 animate-spin rounded-full border-b-2" />
      </div>
    );
  }

  if (user) {
    return <Navigate to={redirectTarget || (profile ? "/" : "/profiles")} replace />;
  }

  if (statusQuery.data && !statusQuery.data.enabled) {
    return (
      <div className="auth-shell">
        <Card className="auth-card glass panel-border w-full max-w-sm border-0">
          <CardHeader>
            <CardTitle className="text-3xl font-extrabold tracking-[-0.04em]">
              {serverName}
            </CardTitle>
            <CardDescription className="mt-2 text-sm leading-6">
              {tr("pages.signup.public_signups_are_currently_closed")}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error("errors.auth.passwords_do_not_match");
      return;
    }
    setSubmitting(true);
    try {
      await signup(username, email, password, inviteCode);
      if (redirectTarget) {
        navigate(redirectTarget, { replace: true });
        return;
      }
      try {
        const profileList = await api<{ profiles: Profile[] }>("/profiles");
        const soleProfile = getBootstrapProfile(profileList.profiles ?? []);
        if (soleProfile) {
          selectProfile(soleProfile);
          navigate("/");
          return;
        }
      } catch {
        navigate("/profiles");
        return;
      }
      navigate("/profiles");
    } catch (err) {
      toast.error("errors.auth.signup_failed", { error: err });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-shell">
      <AuthBackground />
      <Card className="auth-card glass panel-border w-full max-w-sm border-0">
        <CardHeader>
          <CardTitle className="text-3xl font-extrabold tracking-[-0.04em]">{serverName}</CardTitle>
          <CardDescription className="mt-2 text-sm leading-6">
            {tr("pages.signup.create_a_new_account_to_get_started")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="signup-username">{tr("pages.signup.username")}</Label>
              <Input
                id="signup-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="signup-email">{tr("pages.signup.email")}</Label>
              <Input
                id="signup-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="signup-password">{tr("pages.signup.password")}</Label>
              <p className="text-muted-foreground text-xs">
                {tr("pages.signup.at_least_8_characters")}
              </p>
              <PasswordInput
                id="signup-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="signup-confirm-password">{tr("pages.signup.confirm_password")}</Label>
              <PasswordInput
                id="signup-confirm-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
              {confirmPassword && password !== confirmPassword && (
                <p className="text-destructive text-xs">
                  {tr("pages.signup.passwords_do_not_match")}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="signup-invite-code">{tr("pages.signup.invite_code")}</Label>
              <Input
                id="signup-invite-code"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder={tr("pages.signup.enter_your_invite_code")}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? tr("pages.signup.creating_account") : tr("pages.signup.create_account")}
            </Button>
          </form>
          <p className="text-muted-foreground mt-4 text-center text-sm">
            {tr("pages.signup.already_have_an_account")}{" "}
            <Link
              to={
                redirectTarget ? `/login?redirect=${encodeURIComponent(redirectTarget)}` : "/login"
              }
              className="text-foreground underline hover:no-underline"
            >
              {tr("pages.signup.sign_in")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
