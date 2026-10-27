import Login from "@/app/login/page";
export const dynamic = "force-dynamic";
export default async function Signup({searchParams}: {searchParams: Promise<{notice?: string}>}) {
  return <Login searchParams={Promise.resolve({...await searchParams, mode:"signup"})} />;
}
