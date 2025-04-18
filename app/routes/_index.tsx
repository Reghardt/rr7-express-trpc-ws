import { useTRPC } from "~/providers/TRPCReactProvider";
import type { Route } from "../+types/root";
import { useQuery } from "@tanstack/react-query";
import { useSubscription } from "@trpc/tanstack-react-query";
import { Link } from "react-router";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "New React Router App" },
    { name: "description", content: "Welcome to React Router!" },
  ];
}

export function loader({ context }: Route.LoaderArgs) {
  return { message: context.VALUE_FROM_EXPRESS };
}

export default function Home() {
  const trpc = useTRPC();
  const qr = useQuery(trpc.greeting.hello.queryOptions({ name: "test 8" }));

  const sub = useSubscription(trpc.post.randomNumber.subscriptionOptions());
  return (
    <div>
      <Link to={"/test"}>Test unsub</Link>
      <div>{sub.data?.randomNumber}</div>
      <div>{qr.data}</div>

      <div>Test</div>
    </div>
  );
}
