import { data, redirect } from "react-router";
import { legacyLocation } from "../i18n/locale";
import type { Route } from "./+types/legacy";

export function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const target = legacyLocation(url.pathname, url.search, request.headers);
  if (!target) throw data({ message: "not_found" }, { status: 404 });
  throw redirect(target, { status: 302, headers: { "Cache-Control": "private, no-store", Vary: "Accept-Language, Cookie" } });
}
