import * as React from "react";
import { ArrowLeft, CreditCard, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiPost } from "@/lib/apiClient";
import {
  loadRazorpayCheckout,
  openRazorpayCheckout,
  type RazorpaySuccessResponse,
} from "@/lib/razorpayCheckout";

interface CreateOrderResponse {
  orderId: string;
  amountPaise: number;
  currency: string;
  keyId: string;
}

// Comfortably longer than a real payment takes, comfortably shorter than the 30-minute
// payment token, so a stuck modal always resolves to a visible state before the token dies.
const PAYMENT_WINDOW_TIMEOUT_MS = 15 * 60 * 1000;

export function PaymentStep({
  paymentToken,
  onPaid,
  onExit,
}: {
  paymentToken: string;
  onPaid: () => void;
  onExit: () => void;
}) {
  const [scriptError, setScriptError] = React.useState<string | null>(null);
  const [amountPaise, setAmountPaise] = React.useState<number | null>(null);
  const [currency, setCurrency] = React.useState<string | null>(null);
  const [paying, setPaying] = React.useState(false);
  const [verifying, setVerifying] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  // Set only when money may have already moved (a verify call that failed after the
  // modal reported success, or a payment window that timed out with no callback at all).
  // Kept apart from errorMessage so the UI can refuse to offer a retry in exactly these
  // cases, while still offering retry for a create-order failure or a dismissed modal,
  // where no charge has happened.
  const [uncertainPaymentMessage, setUncertainPaymentMessage] = React.useState<string | null>(null);

  const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const clearPaymentTimeout = React.useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);
  React.useEffect(() => clearPaymentTimeout, [clearPaymentTimeout]);

  React.useEffect(() => {
    let cancelled = false;
    loadRazorpayCheckout().catch((err: unknown) => {
      if (!cancelled) setScriptError(err instanceof Error ? err.message : "Could not load the payment gateway.");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleVerify = React.useCallback(
    async (response: RazorpaySuccessResponse) => {
      clearPaymentTimeout();
      setVerifying(true);
      setErrorMessage(null);
      try {
        await apiPost(
          "/api/payments/verify",
          {
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
          },
          { headers: { Authorization: `Bearer ${paymentToken}` } }
        );
        onPaid();
      } catch {
        setUncertainPaymentMessage(
          "Your payment may have already been completed, but we could not confirm it. Please do not pay again — contact your HOD to check your payment status."
        );
      } finally {
        setVerifying(false);
        setPaying(false);
      }
    },
    [paymentToken, onPaid, clearPaymentTimeout]
  );

  const handlePay = React.useCallback(async () => {
    clearPaymentTimeout();
    setErrorMessage(null);
    setPaying(true);

    try {
      await loadRazorpayCheckout();
      setScriptError(null);
    } catch (err: unknown) {
      setPaying(false);
      setScriptError(err instanceof Error ? err.message : "Could not load the payment gateway.");
      return;
    }

    let order: CreateOrderResponse;
    try {
      order = await apiPost("/api/payments/create-order", {}, {
        headers: { Authorization: `Bearer ${paymentToken}` },
      });
    } catch (err: unknown) {
      setPaying(false);
      setErrorMessage(err instanceof Error ? err.message : "Could not start the payment. Please try again.");
      return;
    }
    setAmountPaise(order.amountPaise);
    setCurrency(order.currency);

    try {
      const checkout = openRazorpayCheckout({
        key: order.keyId,
        amount: order.amountPaise,
        currency: order.currency,
        order_id: order.orderId,
        name: "E-Logbook",
        description: "Registration payment",
        handler: (response) => {
          void handleVerify(response);
        },
        modal: {
          ondismiss: () => {
            clearPaymentTimeout();
            setPaying(false);
            setErrorMessage("Payment window was closed before completing. You can try again.");
          },
        },
      });
      checkout.on("payment.failed", (response) => {
        clearPaymentTimeout();
        setPaying(false);
        setErrorMessage(response.error?.description || "Payment failed. Please try again.");
      });
      checkout.open();
      // Neither handler, ondismiss, nor payment.failed is guaranteed to fire — a dropped
      // network connection or a dismissal Razorpay doesn't report would otherwise leave
      // `paying` stuck true forever with no way to retry.
      clearPaymentTimeout();
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        setPaying(false);
        setUncertainPaymentMessage(
          "The payment window was open for more than 15 minutes with no response. If you completed the payment, it may have gone through — please do not pay again. Contact your HOD to check your payment status."
        );
      }, PAYMENT_WINDOW_TIMEOUT_MS);
    } catch (err: unknown) {
      clearPaymentTimeout();
      setPaying(false);
      setErrorMessage(err instanceof Error ? err.message : "Could not open the payment gateway.");
    }
  }, [paymentToken, handleVerify, clearPaymentTimeout]);

  const busy = paying || verifying;
  const formattedAmount =
    amountPaise !== null && currency
      ? new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(amountPaise / 100)
      : null;

  return (
    <div className="medical-grid flex min-h-screen items-center justify-center p-4 md:p-8">
      <Card className="w-full max-w-md motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-500 motion-reduce:animate-none">
        <CardHeader>
          <div className="flex items-center gap-2 text-teal-800">
            <CreditCard className="h-5 w-5" />
            <span className="text-xs font-bold uppercase tracking-wider">Registration payment</span>
          </div>
          <CardTitle className="mt-2 text-2xl">Complete your payment</CardTitle>
          <CardDescription>
            Your registration has been submitted for HOD review. Pay the registration fee below —
            you'll be able to sign in once payment is confirmed and your HOD has approved your account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {uncertainPaymentMessage && (
            <div role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              {uncertainPaymentMessage}
            </div>
          )}
          {scriptError && (
            <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {scriptError}
            </div>
          )}
          {errorMessage && !uncertainPaymentMessage && (
            <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {errorMessage}
            </div>
          )}
          {formattedAmount && (
            <div className="rounded-xl border border-teal-100 bg-white/80 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-teal-700">Amount due</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{formattedAmount}</p>
            </div>
          )}
          {!uncertainPaymentMessage && (
            <Button type="button" className="h-11 w-full" onClick={() => void handlePay()} disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {verifying ? "Confirming payment..." : "Opening payment gateway..."}
                </>
              ) : (
                <>
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  {errorMessage || scriptError ? "Retry payment" : "Pay now"}
                </>
              )}
            </Button>
          )}
          <button
            type="button"
            onClick={onExit}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 text-xs font-medium text-teal-700 hover:underline disabled:opacity-50"
          >
            <ArrowLeft className="h-3 w-3" /> Back to sign in
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
