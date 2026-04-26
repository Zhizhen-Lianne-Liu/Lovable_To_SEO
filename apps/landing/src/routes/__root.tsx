import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "lovabletoseo · The AI marketer for Lovable founders" },
      {
        name: "description",
        content:
          "Your Lovable app is a React SPA. Google sees an empty <div id=\"root\">. ChatGPT has nothing to cite. lovabletoseo rebuilds it as static HTML enhanced with Peec buyer-query data — and PRs the result back to your repo so you can keep editing in Lovable.",
      },
      { name: "author", content: "lovabletoseo" },
      { property: "og:title", content: "lovabletoseo · The AI marketer for Lovable founders" },
      {
        property: "og:description",
        content:
          "Turn your Lovable React SPA into static HTML LLMs can cite. One PR, fourteen stages, no black box.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "lovabletoseo · The AI marketer for Lovable founders" },
      {
        name: "twitter:description",
        content:
          "Turn your Lovable React SPA into static HTML LLMs can cite. One PR, fourteen stages, no black box.",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return <Outlet />;
}
