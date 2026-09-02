import { useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { InvitationLookupResponse, LoginResponse } from "@/api/types";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/PasswordInput";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthBackground } from "@/components/auth/AuthBackground";
import { clearHouseholdSetupDone, setTourSuppressed } from "@/lib/onboarding";
import { buildInviteDeepLink, detectMobilePlatform } from "@/lib/appDeepLink";
import { Smartphone } from "lucide-react";
import { toast } from "@/i18n/toast";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

/**
 * Public claim screen for an emailed invitation: /invite/:token.
 * Everything except the password was decided when the invite was sent, so
 * this screen asks for exactly one thing. On success the accept response is
 * a normal login payload — the user lands signed in, never at /login.
 */
export default function InviteClaim() {
  useUILanguage();
  const { token = "" } = useParams();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Set right before completeLogin: the moment auth state lands, this
  // component re-renders with a user — without the flag, the signed-in
  // redirect below would race our own navigate to /household-setup.
  const [accepted, setAccepted] = useState(false);
  const { user, loading, completeLogin } = useAuth();
  const navigate = useNavigate();

  const lookup = useQuery({
    queryKey: ["invitation", token],
    queryFn: () => api<InvitationLookupResponse>(`/invitations/${token}`),
    enabled: token !== "",
    retry: false,
    staleTime: Infinity,
  });

  if (loading || lookup.isPending) {
    return (
      <div className="auth-shell">
        <div className="border-primary h-8 w-8 animate-spin rounded-full border-b-2" />
      </div>
    );
  }

  // Already signed in — an invite link can't act on this session. Skipped
  // when this very screen just created the session (accepted).
  if (user && !accepted) {
    return <Navigate to="/" replace />;
  }

  if (lookup.isError || !lookup.data) {
    return (
      <div className="auth-shell">
        <AuthBackground />
        <Card className="auth-card glass panel-border w-full max-w-sm border-0">
          <CardHeader>
            <CardTitle className="text-3xl font-extrabold tracking-[-0.04em]">
              {tr("pages.invite_claim.invitation_expired")}
            </CardTitle>
            <CardDescription className="mt-2 text-sm leading-6">
              {tr("pages.invite_claim.this_invite_link_is_no_longer_valid_it_may_have")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-center text-sm">
              {tr("pages.invite_claim.already_have_an_account")}{" "}
              <Link to="/login" className="text-foreground underline hover:no-underline">
                {tr("pages.invite_claim.sign_in")}
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const invitation = lookup.data;

  // On Android, offer to continue in the native app — the app registers
  // silo://invite and has the full claim flow. A user-tapped custom-scheme
  // link is the one context where silo:// works reliably; we never fire it
  // automatically (there is no installed-check, and a miss shows an OS
  // error). iOS joins once the Apple app registers the scheme.
  const platform = detectMobilePlatform(navigator.userAgent);
  const appLink =
    platform === "android" ? buildInviteDeepLink(window.location.origin, token) : null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error("errors.auth.passwords_do_not_match");
      return;
    }
    setSubmitting(true);
    try {
      const data = await api<LoginResponse>(`/invitations/${token}/accept`, {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      setAccepted(true);
      // A fresh account starts household setup fresh, even if a previous
      // invitee finished theirs on this browser.
      clearHouseholdSetupDone();
      completeLogin(data);
      if (!invitation.show_tour) {
        // The onboarding gate honors this hint by recording a server-side
        // skip once a profile is active, then clears it.
        setTourSuppressed();
      }
      navigate("/household-setup", { replace: true });
    } catch (err) {
      toast.error("errors.auth.invitation_accept_failed", { error: err });
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-shell">
      <AuthBackground />
      <Card className="auth-card glass panel-border w-full max-w-sm border-0">
        <CardHeader>
          {invitation.inviter_name && (
            <p className="text-muted-foreground font-mono text-[11px] font-semibold tracking-[0.1em] uppercase">
              {tr("pages.invite_claim.invited_by")} {invitation.inviter_name}
            </p>
          )}
          <CardTitle className="text-3xl font-extrabold tracking-[-0.04em]">
            {tr("pages.invite_claim.welcome_to")} {invitation.server_name}
          </CardTitle>
          <CardDescription className="mt-2 text-sm leading-6">
            {tr("pages.invite_claim.choose_a_password_and_you_re_in_you_ll_sign")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {appLink && (
            <div className="mb-6 space-y-3">
              <Button asChild size="lg" className="h-12 w-full text-base font-semibold">
                <a href={appLink}>
                  <Smartphone className="mr-2 h-5 w-5" />{" "}
                  {tr("pages.invite_claim.open_in_the_silo_app")}
                </a>
              </Button>
              <p className="text-muted-foreground text-center text-xs">
                {tr(
                  "pages.invite_claim.nothing_happens_the_app_isn_t_installed_just_continue_below",
                )}
              </p>
              <div className="flex items-center gap-3">
                <div className="border-border flex-1 border-t" />
                <span className="text-muted-foreground text-xs uppercase">
                  {tr("pages.invite_claim.or_set_up_in_the_browser")}
                </span>
                <div className="border-border flex-1 border-t" />
              </div>
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="invite-email">{tr("pages.invite_claim.email")}</Label>
              <Input id="invite-email" value={invitation.email} readOnly disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-password">{tr("pages.invite_claim.password")}</Label>
              <p className="text-muted-foreground text-xs">
                {tr("pages.invite_claim.at_least_8_characters")}
              </p>
              <PasswordInput
                id="invite-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                // On mobile, focusing here pops the keyboard over the
                // open-in-app button — the primary action when it's shown.
                autoFocus={!appLink}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-confirm-password">
                {tr("pages.invite_claim.confirm_password")}
              </Label>
              <PasswordInput
                id="invite-confirm-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
              {confirmPassword && password !== confirmPassword && (
                <p className="text-destructive text-xs">
                  {tr("pages.invite_claim.passwords_do_not_match")}
                </p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting
                ? tr("pages.invite_claim.creating_account")
                : tr("pages.invite_claim.create_account")}
            </Button>
          </form>
          <p className="text-muted-foreground mt-4 text-center text-sm">
            {tr("pages.invite_claim.already_set_this_up")}{" "}
            <Link to="/login" className="text-foreground underline hover:no-underline">
              {tr("pages.invite_claim.sign_in")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
