export default async function ServerPage() {
  return (
    <main className="p-8 flex flex-col gap-4 mx-auto max-w-2xl">
      <h1 className="text-4xl font-bold text-center">Protected Route</h1>
      <div className="flex flex-col gap-4 bg-slate-200 dark:bg-slate-800 p-4 rounded-md">
        <h2 className="text-xl font-bold">Auth Middleware Verified</h2>
        <p>
          This route is protected by Clerk middleware and remains available as a
          secure server-rendered entry point.
        </p>
      </div>
    </main>
  );
}
