"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useSignTypedData } from "wagmi";
import { signTypedData } from "viem/actions";
import { OrderUpdateEventSchema, type OrderUpdateEvent } from "@/lib/schemas/nado";

const NADO_SUBSCRIBE_WS = "wss://gateway.prod.nado.xyz/v1/subscribe";
const PING_INTERVAL_MS = 25_000;
const EXPIRATION_VALIDITY_S = 90;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

const STREAM_AUTH_DOMAIN = {
  name: "Nado" as const,
  version: "0.0.1" as const,
  chainId: 57073,
  verifyingContract: "0x05ec92d78ed421f3d3ada77ffde167106565974e" as const,
} as const;

const STREAM_AUTH_TYPES = {
  StreamAuthentication: [
    { name: "sender", type: "bytes32" },
    { name: "expiration", type: "uint64" },
  ],
} as const;

type StoredStreamAuth = {
  sender: `0x${string}`;
  expiration: string;
  signature: string;
  expiresAtS: number;
};

function toDefaultSubaccount(address: string): `0x${string}` {
  const addr = address.toLowerCase().replace("0x", "");
  return `0x${addr}64656661756c740000000000` as `0x${string}`;
}

type LinkedSignerClient = Parameters<typeof signTypedData>[0] | null;

type UseOrderStreamOptions = {
  onOrderUpdate: (event: OrderUpdateEvent) => void;
  enabled: boolean;
  subaccounts: string[] | null;
  linkedSignerClient?: LinkedSignerClient;
};

type UseOrderStreamResult = {
  connected: boolean;
  signatureNeeded: boolean;
  requestSignature: () => void;
  authenticated: boolean;
};

export function useOrderStream(
  { onOrderUpdate, enabled, subaccounts, linkedSignerClient }: UseOrderStreamOptions,
): UseOrderStreamResult {
  const { address: connectedAddress } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();

  const [connected, setConnected] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [hasSigned, setHasSigned] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);
  const cancelledRef = useRef(false);
  const onOrderUpdateRef = useRef(onOrderUpdate);
  const signingRef = useRef<Promise<StoredStreamAuth | null> | null>(null);
  const storedAuthRef = useRef<StoredStreamAuth | null>(null);

  useEffect(() => {
    onOrderUpdateRef.current = onOrderUpdate;
  });

  const signAuth = useCallback(async (): Promise<StoredStreamAuth | null> => {
    if (!connectedAddress) return null;

    const stored = storedAuthRef.current;
    if (stored && Date.now() / 1000 < stored.expiresAtS - 10) {
      return stored;
    }

    if (signingRef.current) return signingRef.current;

    const doSign = async (): Promise<StoredStreamAuth | null> => {
      const sender = toDefaultSubaccount(connectedAddress);
      const expirationS = Math.floor(Date.now() / 1000) + EXPIRATION_VALIDITY_S;
      const expiration = String(expirationS * 1000);

      try {
        let signature: `0x${string}`;

        if (linkedSignerClient && linkedSignerClient.account) {
          signature = await signTypedData(linkedSignerClient, {
            account: linkedSignerClient.account,
            domain: STREAM_AUTH_DOMAIN,
            types: STREAM_AUTH_TYPES,
            primaryType: "StreamAuthentication" as const,
            message: { sender, expiration: BigInt(expiration) },
          });
        } else {
          signature = await signTypedDataAsync({
            domain: STREAM_AUTH_DOMAIN,
            types: STREAM_AUTH_TYPES,
            primaryType: "StreamAuthentication",
            message: { sender, expiration: BigInt(expiration) },
          });
        }

        const auth: StoredStreamAuth = { sender, expiration, signature, expiresAtS: expirationS };
        storedAuthRef.current = auth;
        return auth;
      } catch (e) {
        if (e instanceof Error && e.message.includes("User rejected")) {
          setHasSigned(false);
          storedAuthRef.current = null;
          return null;
        }
        throw e;
      } finally {
        signingRef.current = null;
      }
    };

    const promise = doSign();
    signingRef.current = promise;
    return promise;
  }, [connectedAddress, signTypedDataAsync, linkedSignerClient]);

  useEffect(() => {
    if (!enabled || !connectedAddress || !hasSigned) {
      wsRef.current?.close();
      wsRef.current = null;
      setConnected(false);
      setAuthenticated(false);
      return;
    }

    cancelledRef.current = false;
    attemptRef.current = 0;

    function cleanup() {
      cancelledRef.current = true;
      if (pingTimerRef.current) clearInterval(pingTimerRef.current);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
      setConnected(false);
      setAuthenticated(false);
    }

    async function connect() {
      if (cancelledRef.current) return;

      const stored = storedAuthRef.current;
      const isReconnect = attemptRef.current > 0;
      if (isReconnect && (!stored || Date.now() / 1000 >= stored.expiresAtS - 10)) {
        setHasSigned(false);
        storedAuthRef.current = null;
        return;
      }

      const auth = await signAuth();
      if (!auth || cancelledRef.current) return;

      const ws = new WebSocket(NADO_SUBSCRIBE_WS);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelledRef.current) { ws.close(); return; }
        setConnected(true);
        attemptRef.current = 0;

        ws.send(JSON.stringify({
          method: "authenticate",
          id: 1,
          tx: { sender: auth.sender, expiration: auth.expiration },
          signature: auth.signature,
        }));

        pingTimerRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ method: "ping" }));
          }
        }, PING_INTERVAL_MS);
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          const data: unknown = JSON.parse(String(event.data));
          if (typeof data !== "object" || data === null) return;

          const msg = data as Record<string, unknown>;

          // Auth response (id: 1)
          if (msg.id === 1 && "result" in msg) {
            setAuthenticated(true);
            const subs = subaccounts ?? [auth.sender];
            subs.forEach((sub, i) => {
              ws.send(JSON.stringify({
                method: "subscribe",
                stream: {
                  type: "order_update",
                  subaccount: sub,
                  product_id: null,
                },
                id: 100 + i,
              }));
            });
            return;
          }

          // Order update event
          if (msg.type === "order_update") {
            const parsed = OrderUpdateEventSchema.safeParse(msg);
            if (parsed.success) {
              onOrderUpdateRef.current(parsed.data);
            }
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        if (pingTimerRef.current) clearInterval(pingTimerRef.current);
        setConnected(false);
        setAuthenticated(false);
        wsRef.current = null;

        if (cancelledRef.current) return;

        const delay = Math.min(
          RECONNECT_BASE_MS * 2 ** attemptRef.current,
          RECONNECT_MAX_MS,
        );
        attemptRef.current += 1;
        reconnectTimerRef.current = setTimeout(() => {
          void connect();
        }, delay);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    void connect();
    return cleanup;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, connectedAddress, hasSigned, signAuth, subaccounts?.join(",")]);

  useEffect(() => {
    if (!connectedAddress) {
      setHasSigned(false);
      setAuthenticated(false);
      storedAuthRef.current = null;
    }
  }, [connectedAddress]);

  // Auto-sign when linked signer becomes available
  useEffect(() => {
    if (linkedSignerClient && !hasSigned && enabled && connectedAddress) {
      setHasSigned(true);
    }
  }, [linkedSignerClient, hasSigned, enabled, connectedAddress]);

  const requestSignature = useCallback(() => {
    setHasSigned(true);
  }, []);

  const signatureNeeded = !!connectedAddress && !hasSigned && enabled;

  return {
    connected,
    signatureNeeded,
    requestSignature,
    authenticated,
  };
}
