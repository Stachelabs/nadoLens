"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ink } from "viem/chains";
import {
  createDeterministicLinkedSignerPrivateKey,
  subaccountToHex,
} from "@nadohq/shared";
import { toast } from "sonner";

const CHAIN_ID = 57073;
const ENDPOINT_ADDRESS = "0x05ec92D78ED421f3D3Ada77FFdE167106565974E";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const REVOCATION_POLL_MS = 5 * 60 * 1000;

type LinkedSignerEntry = {
  subaccountName: string;
  walletClient: ReturnType<typeof createWalletClient>;
  address: string;
};

type UseLinkedSignerResult = {
  linkedSigners: Map<string, LinkedSignerEntry>;
  has1CT: boolean;
  signatureNeeded: boolean;
  deriveKeys: () => void;
  deriving: boolean;
};

// Module-level storage — not persisted, not in React state
let storedSigners: Map<string, LinkedSignerEntry> = new Map();
let storedForAddress: string | null = null;

function clearStoredSigners() {
  storedSigners = new Map();
  storedForAddress = null;
}

async function fetch1CTStatus(
  exploredAddress: string,
  subaccounts: { subaccount: string; label: string }[],
  signal: AbortSignal,
): Promise<Map<string, string>> {
  const subs = subaccounts.map((s) => s.subaccount).join(",");
  const res = await fetch(
    `/api/wallet/${exploredAddress}/linked-signer?subaccounts=${subs}`,
    { signal },
  );
  if (!res.ok) return new Map();
  const data = (await res.json()) as { signers: Record<string, string> };
  const result = new Map<string, string>();
  for (const [sub, signer] of Object.entries(data.signers)) {
    if (signer !== ZERO_ADDRESS) {
      result.set(sub, signer);
    }
  }
  return result;
}

export function useLinkedSigner(
  exploredAddress: string | null,
  crossSubaccounts: { subaccount: string; label: string; name: string }[] | null,
  phase1Ready: boolean,
): UseLinkedSignerResult {
  const { address: connectedAddress } = useAccount();
  const { data: walletClient } = useWalletClient();

  const [signers, setSigners] = useState<Map<string, LinkedSignerEntry>>(
    () => new Map(),
  );
  const [onChain1CT, setOnChain1CT] = useState<Map<string, string>>(
    () => new Map(),
  );
  const [deriving, setDeriving] = useState(false);
  const [hasDerived, setHasDerived] = useState(false);

  const mountedRef = useRef(true);
  const revocationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isOwnWallet =
    !!exploredAddress &&
    !!connectedAddress &&
    exploredAddress.toLowerCase() === connectedAddress.toLowerCase();

  // Detect 1CT status on page load
  useEffect(() => {
    if (!isOwnWallet || !crossSubaccounts || !phase1Ready) {
      setOnChain1CT(new Map());
      return;
    }

    const controller = new AbortController();

    void fetch1CTStatus(exploredAddress!, crossSubaccounts, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setOnChain1CT(result);
      })
      .catch(() => {});

    return () => controller.abort();
  }, [isOwnWallet, exploredAddress, crossSubaccounts, phase1Ready]);

  // Revocation polling
  useEffect(() => {
    if (!isOwnWallet || !crossSubaccounts || !hasDerived || onChain1CT.size === 0) {
      if (revocationTimerRef.current) clearInterval(revocationTimerRef.current);
      return;
    }

    const poll = () => {
      const controller = new AbortController();
      void fetch1CTStatus(exploredAddress!, crossSubaccounts, controller.signal)
        .then((fresh) => {
          if (!mountedRef.current) return;
          for (const [sub] of storedSigners) {
            if (!fresh.has(sub)) {
              // Revoked
              storedSigners.delete(sub);
              setSigners(new Map(storedSigners));
              toast.warning("1-Click Trading was revoked — live updates paused");
            }
          }
          setOnChain1CT(fresh);
        })
        .catch(() => {});
    };

    revocationTimerRef.current = setInterval(poll, REVOCATION_POLL_MS);
    return () => {
      if (revocationTimerRef.current) clearInterval(revocationTimerRef.current);
    };
  }, [isOwnWallet, exploredAddress, crossSubaccounts, hasDerived, onChain1CT.size]);

  // Clear on disconnect/address change
  useEffect(() => {
    if (!connectedAddress || connectedAddress.toLowerCase() !== storedForAddress) {
      clearStoredSigners();
      setSigners(new Map());
      setHasDerived(false);
    }
  }, [connectedAddress]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const derivingLockRef = useRef(false);

  const deriveKeys = useCallback(async () => {
    if (!walletClient || !connectedAddress || !crossSubaccounts) return;
    if (onChain1CT.size === 0) return;
    if (derivingLockRef.current) return;

    derivingLockRef.current = true;
    setDeriving(true);

    if (storedForAddress && storedForAddress !== connectedAddress.toLowerCase()) {
      clearStoredSigners();
    }

    try {
      const newSigners = new Map<string, LinkedSignerEntry>();

      for (const sub of crossSubaccounts) {
        if (!onChain1CT.has(sub.subaccount)) continue;

        const subHex = subaccountToHex({
          subaccountOwner: connectedAddress,
          subaccountName: sub.name,
        });

        // Check module-level cache first
        const cached = storedSigners.get(sub.subaccount);
        if (cached) {
          newSigners.set(sub.subaccount, cached);
          continue;
        }

        const derivedKey = await createDeterministicLinkedSignerPrivateKey({
          walletClient,
          chainId: CHAIN_ID,
          endpointAddress: ENDPOINT_ADDRESS,
          subaccountOwner: connectedAddress,
          subaccountName: sub.name,
        });

        const account = privateKeyToAccount(derivedKey);
        const linkedWalletClient = createWalletClient({
          account,
          chain: ink,
          transport: http(),
        });

        const entry: LinkedSignerEntry = {
          subaccountName: sub.name,
          walletClient: linkedWalletClient,
          address: account.address,
        };
        newSigners.set(sub.subaccount, entry);
      }

      storedSigners = newSigners;
      storedForAddress = connectedAddress.toLowerCase();

      if (mountedRef.current) {
        setSigners(new Map(newSigners));
        setHasDerived(true);
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes("User rejected")) {
        toast.warning("Signature rejected — live updates disabled");
      }
    } finally {
      derivingLockRef.current = false;
      if (mountedRef.current) setDeriving(false);
    }
  }, [walletClient, connectedAddress, crossSubaccounts, onChain1CT]);

  const has1CT = onChain1CT.size > 0;
  const signatureNeeded = isOwnWallet && has1CT && !hasDerived && phase1Ready;

  return {
    linkedSigners: signers,
    has1CT,
    signatureNeeded,
    deriveKeys,
    deriving,
  };
}
