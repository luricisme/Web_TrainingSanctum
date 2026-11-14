/** Page masthead shared by shell pages: a bold title and a quiet summary line. */
export function PageHeader({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <header>
      <h1 className="text-balance break-words text-heading-1 text-foreground">{title}</h1>
      {children ? (
        <p className="mt-2 text-body text-foreground-secondary">{children}</p>
      ) : null}
    </header>
  );
}
