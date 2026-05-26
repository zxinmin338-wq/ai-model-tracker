export default async function ModelDetailPage({
  params,
}: {
  params: Promise<{ permaslug: string }>;
}) {
  const { permaslug } = await params;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">
        {decodeURIComponent(permaslug)}
      </h1>
      <p className="text-muted-foreground mt-1">Coming in Phase 4</p>
    </div>
  );
}
