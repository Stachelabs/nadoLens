import { AirdropHeader } from "@/components/airdrop/AirdropHeader";

export default function AirdropLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <AirdropHeader />
      {children}
    </div>
  );
}
