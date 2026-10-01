import { data, Outlet, useParams } from "react-router";
import { isLocale } from "../i18n/locale";
import type { Route } from "./+types/locale-layout";

export function loader({ params }: Route.LoaderArgs) {
  if (!isLocale(params.lang)) throw data({ message: "not_found" }, { status: 404 });
  return null;
}

export default function LocaleLayout() {
  return <Outlet key={useParams().lang} />;
}
