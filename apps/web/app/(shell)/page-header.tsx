/** Editorial masthead shared by shell pages: title and divider. */
export function PageHeader({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <header>
      <h1 className="text-heading-1 text-foreground">
        {title}
      </h1>
      <hr aria-hidden="true" className="mt-6 border-0 border-t border-divider" />
      {children ? (
        <p className="mt-6 text-body text-foreground-secondary">
          {children}
        </p>
      ) : null}
    </header>
  );
}
