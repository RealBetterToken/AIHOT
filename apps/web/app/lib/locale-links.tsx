import { Link as RouterLink, NavLink as RouterNavLink, type LinkProps, type NavLinkProps, type To } from "react-router";
import type { ComponentProps } from "react";
import { useLocale } from "../i18n";
import { apiPath, localePath, type Locale } from "../i18n/locale";

function localizedTo(to: To, locale: Locale): To {
  return typeof to === "string" ? localePath(to, locale) : { ...to, ...(to.pathname ? { pathname: localePath(to.pathname, locale) } : {}) };
}

export function Link({ to, ...props }: LinkProps) {
  return <RouterLink {...props} to={localizedTo(to, useLocale())} />;
}

export function NavLink({ to, ...props }: NavLinkProps) {
  return <RouterNavLink {...props} to={localizedTo(to, useLocale())} />;
}

export function LocaleAnchor({ href, ...props }: ComponentProps<"a">) {
  const locale = useLocale();
  const localized = href && /^\/feed(?:\.xml|\/)/.test(href) ? apiPath(href, locale) : href ? localePath(href, locale) : href;
  return <a {...props} href={localized} />;
}
