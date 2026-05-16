export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-background p-6 font-sans">
      <span className="text-2xl font-semibold tracking-tight">Санхүү</span>
      {children}
    </div>
  );
}
