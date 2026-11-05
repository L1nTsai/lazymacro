export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex h-dvh w-full max-w-sm flex-col justify-center px-4 py-10">
      <p className="mb-8 text-lg font-semibold tracking-tight">LazyMacro</p>
      {children}
    </main>
  );
}
