export default function P01Workspace({tenantId}:{tenantId:string}) {
  const src=`clinic.html?embed=1&tenant=${encodeURIComponent(tenantId)}`;
  return (
    <section className="overflow-hidden rounded-2xl border bg-white shadow-soft">
      <iframe
        title="P01 Interactive Evidence Workspace"
        src={src}
        className="h-[82vh] min-h-[760px] w-full border-0 bg-slate-100"
        loading="eager"
      />
    </section>
  );
}
