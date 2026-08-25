import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Page } from "@/components/shell";
import { SpotCard } from "@/components/spot-card";
import { ClubCard } from "@/components/club-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getMyProfile,
  listSavedClubs,
  listSavedSpots,
  updateMyProfile,
} from "@/lib/tideline/api";
import { useFavorites } from "@/lib/tideline/use-favorites";
import { getOfficeAccess } from "@/lib/tideline/office";
import { isUnauthorized, useLoad } from "@/lib/tideline/use-load";
import { useT } from "@/lib/tideline/place-store";

export const Route = createFileRoute("/profile")({ component: ProfilePage });

function ProfilePage() {
  const t = useT();
  const { user, isPending } = useCurrentUserState();
  const profile = useLoad(async () => {
    if (isPending || !user) return null;
    return getMyProfile();
  }, [user?.id, isPending]);
  const saved = useLoad(async () => {
    if (isPending || !user) return [];
    return listSavedSpots();
  }, [user?.id, isPending]);
  const savedClubs = useLoad(async () => {
    if (isPending || !user) return [];
    try {
      return await listSavedClubs();
    } catch {
      return [];
    }
  }, [user?.id, isPending]);
  const office = useLoad(async () => {
    if (isPending || !user) return null;
    try {
      return await getOfficeAccess();
    } catch {
      return null;
    }
  }, [user?.id, isPending]);

  const fav = useFavorites();
  const [displayName, setDisplayName] = useState("");
  const [homeWater, setHomeWater] = useState("");
  const [stroke, setStroke] = useState("");
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile.data) return;
    setDisplayName(profile.data.displayName);
    setHomeWater(profile.data.homeWater ?? "");
    setStroke(profile.data.stroke ?? "");
    setBio(profile.data.bio ?? "");
  }, [profile.data]);

  if (isPending) {
    return (
      <Page>
        <Skeleton className="h-10 w-48" />
        <Skeleton className="mt-6 h-40 rounded-xl" />
      </Page>
    );
  }
  if (!user) return <RedirectToSignIn />;

  return (
    <Page>
      <p className="text-xs font-medium uppercase tracking-widest text-accent">
        {t("profile.kicker")}
      </p>
      <h1 className="mt-2 font-display text-4xl font-medium tracking-tight text-fg">
        {displayName || user.displayName || "Swimmer"}
      </h1>
      <p className="mt-2 text-muted">{t("profile.lead")}</p>
      {office.data?.status === "owner" ? (
        <div className="mt-4">
          <Button asChild size="sm" variant="outline">
            <Link to="/office">{t("nav.office")}</Link>
          </Button>
        </div>
      ) : null}

      <section className="mt-12 grid gap-10 lg:grid-cols-[1fr_0.9fr]">
        <div className="space-y-10">
          <form
            className="space-y-3 rounded-xl bg-surface p-5 shadow-[var(--shadow-border)]"
            onSubmit={async (e) => {
              e.preventDefault();
              setSaving(true);
              try {
                await updateMyProfile({
                  data: { displayName, homeWater, bio, stroke },
                });
                toast(t("toast.profile"));
                profile.reload();
              } catch (err) {
                if (isUnauthorized(err)) window.location.href = "/login";
                else toast.error(t("toast.profileFail"));
              } finally {
                setSaving(false);
              }
            }}
          >
            <h2 className="font-display text-2xl text-fg">{t("profile.how")}</h2>
            <Field label={t("profile.name")}>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
              />
            </Field>
            <Field label={t("profile.homeWater")}>
              <Input
                value={homeWater}
                onChange={(e) => setHomeWater(e.target.value)}
                placeholder={t("profile.homeWaterPh")}
              />
            </Field>
            <Field label={t("profile.stroke")}>
              <Input
                value={stroke}
                onChange={(e) => setStroke(e.target.value)}
                placeholder={t("profile.strokePh")}
              />
            </Field>
            <Field label={t("profile.bio")}>
              <Textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder={t("profile.bioPh")}
              />
            </Field>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? t("profile.saving") : t("profile.save")}
            </Button>
          </form>

          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-2xl text-fg">{t("fav.title")}</h2>
              <Link to="/favorites" className="text-sm text-accent">
                {t("fav.seeAll")}
              </Link>
            </div>
            <div className="mt-4 grid gap-3">
              {(saved.data ?? []).length === 0 && (savedClubs.data ?? []).length === 0 ? (
                <p className="text-sm text-muted">{t("profile.savedEmpty")}</p>
              ) : null}
              {(saved.data ?? []).map((spot) => (
                <SpotCard
                  key={spot.id}
                  spot={spot}
                  saved={fav.isSpotSaved(spot.id)}
                  onToggleSave={(id) => void fav.toggleSpot(id)}
                />
              ))}
              {(savedClubs.data ?? []).map((club) => (
                <ClubCard
                  key={club.id}
                  club={club}
                  saved={fav.isClubSaved(club.id)}
                  onToggleSave={(id) => void fav.toggleClub(id)}
                />
              ))}
            </div>
          </div>
        </div>
      </section>
    </Page>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <Label>{label}</Label>
      {children}
    </label>
  );
}
