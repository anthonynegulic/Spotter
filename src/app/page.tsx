"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { FullScreenLoading } from "@/components/ui";

export default function Home() {
  const router = useRouter();
  useEffect(() => router.replace("/today"), [router]);
  return <FullScreenLoading />;
}
