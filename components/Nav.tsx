"use client";

import { useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { ChevronDown, Menu, MessageCircle, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount } from "wagmi";
import { ThemeToggle } from "./ThemeToggle";
import { WalletButton } from "./WalletButton";
import { ServiceStatus } from "./ServiceStatus";

const navLinks = [
  { href: "/protocol", label: "Protocol" },
  { href: "/wallet", label: "Wallet Explorer" },
];

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12.056 0h-.112Zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
    </svg>
  );
}

const socialLinks = [
  { href: "https://discord.com/users/889580761349517373", label: "Discord", icon: DiscordIcon },
  { href: "https://t.me/stache_dev", label: "Telegram", icon: TelegramIcon },
  { href: "https://x.com/nadolens", label: "Twitter", icon: XIcon },
];

export function Nav() {
  const pathname = usePathname();
  const { address, isConnected } = useAccount();
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-sm">
      {/* ── Desktop: single row ── */}
      <div className="mx-auto hidden h-14 max-w-7xl items-center gap-6 px-4 sm:flex">
        <Link
          href="/"
          className="font-bold leading-none tracking-tight text-foreground uppercase text-lg"
        >
          NadoLens
        </Link>

        <div className="flex items-center gap-1">
          {navLinks.map(({ href, label }) => {
            const onMyWallet =
              isConnected && address && pathname === `/wallet/${address}`;
            const isActive = pathname?.startsWith(href) && !onMyWallet;
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  buttonVariants({
                    variant: isActive ? "secondary" : "ghost",
                    size: "sm",
                  }),
                  !isActive && "text-muted-foreground",
                )}
              >
                {label}
              </Link>
            );
          })}

          {isConnected && address && (() => {
            const isMyWallet = pathname === `/wallet/${address}`;
            return (
              <Link
                href={`/wallet/${address}`}
                className={cn(
                  buttonVariants({
                    variant: isMyWallet ? "secondary" : "ghost",
                    size: "sm",
                  }),
                  isMyWallet
                    ? "border border-brand/40 bg-brand/20 text-brand"
                    : "text-brand hover:text-brand/80",
                )}
              >
                My Wallet
              </Link>
            );
          })()}

          <span
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "pointer-events-none gap-1.5 text-muted-foreground/40",
            )}
          >
            Airdrop
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              Soon
            </span>
          </span>

          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "hidden gap-1 text-muted-foreground min-[860px]:inline-flex",
              )}
            >
              Feedback
              <ChevronDown className="size-3 transition-transform duration-200 [[data-popup-open]_&]:rotate-180" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" sideOffset={8}>
              {socialLinks.map(({ href, label, icon: Icon }) => (
                <DropdownMenuItem
                  key={label}
                  render={
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                    />
                  }
                >
                  <Icon className="size-4" />
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <WalletButton />
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon" }),
                "border border-border text-muted-foreground min-[860px]:hidden",
              )}
            >
              <MessageCircle className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={8}>
              {socialLinks.map(({ href, label, icon: Icon }) => (
                <DropdownMenuItem
                  key={label}
                  render={
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                    />
                  }
                >
                  <Icon className="size-4" />
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── Mobile: single row ── */}
      <div className="flex h-14 items-center justify-between px-3 sm:hidden">
        <Link
          href="/"
          className="font-bold leading-none tracking-tight text-foreground uppercase"
        >
          NadoLens
        </Link>

        <div className="flex items-center gap-2">
          <WalletButton />
          <ThemeToggle />
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon" }),
                "size-8 border border-border text-foreground",
              )}
            >
              <Menu
                className={cn(
                  "size-4 transition-all duration-200",
                  sheetOpen && "scale-0 opacity-0 absolute",
                )}
              />
              <X
                className={cn(
                  "size-4 transition-all duration-200",
                  !sheetOpen && "scale-0 opacity-0 absolute",
                )}
              />
            </SheetTrigger>
            <SheetContent side="right">
              <SheetHeader className="sr-only">
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-1 px-2 pt-2">
                {[{ href: "/", label: "Home" }, ...navLinks].map(
                  ({ href, label }) => {
                    const onMyWallet =
                      isConnected &&
                      address &&
                      pathname === `/wallet/${address}`;
                    const isActive =
                      href === "/"
                        ? pathname === "/"
                        : pathname?.startsWith(href) && !onMyWallet;
                    return (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => setSheetOpen(false)}
                        className={cn(
                          buttonVariants({
                            variant: isActive ? "secondary" : "ghost",
                          }),
                          "justify-start",
                          !isActive && "text-muted-foreground",
                        )}
                      >
                        {label}
                      </Link>
                    );
                  },
                )}
                {isConnected && address && (
                  <Link
                    href={`/wallet/${address}`}
                    onClick={() => setSheetOpen(false)}
                    className={cn(
                      buttonVariants({ variant: "ghost" }),
                      "justify-start text-brand hover:text-brand/80",
                      pathname === `/wallet/${address}` && "bg-brand/10",
                    )}
                  >
                    My Wallet
                  </Link>
                )}
                <span
                  className={cn(
                    buttonVariants({ variant: "ghost" }),
                    "pointer-events-none justify-start gap-1.5 text-muted-foreground/40",
                  )}
                >
                  Airdrop
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    Soon
                  </span>
                </span>
              </nav>

              <div className="mt-4 flex flex-col gap-1 border-t border-border px-2 pt-3">
                <p className="mb-1 px-4 text-xs font-medium text-muted-foreground">
                  Feedback
                </p>
                {socialLinks.map(({ href, label, icon: Icon }) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      buttonVariants({ variant: "ghost" }),
                      "w-full justify-start gap-2 text-muted-foreground",
                    )}
                  >
                    <Icon className="size-4" />
                    {label}
                  </a>
                ))}
              </div>

              <div className="mt-auto border-t border-border px-4 py-3">
                <ServiceStatus />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>
  );
}
