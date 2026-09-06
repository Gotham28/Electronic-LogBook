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
      } catch (err: unknown) {
        setErrorMessage(err instanceof Error ? err.message : "Payment verification failed. Please try again.");
      } finally {
        setVerifying(false);
        setPaying(false);
      }
    },
    [paymentToken, onPaid]
  );

  const handlePay = React.useCallback(async () => {
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
            setPaying(false);
            setErrorMessage("Payment window was closed before completing. You can try again.");
          },
        },
      });
      checkout.on("payment.failed", (response) => {
        setPaying(false);
        setErrorMessage(response.error?.description || "Payment failed. Please try again.");
      });
      checkout.open();
    } catch (err: unknown) {
      setPaying(false);
      setErrorMessage(err instanceof Error ? err.message : "Could not open the payment gateway.");
    }
  }, [paymentToken, handleVerify]);

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
          {scriptError && (
            <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {scriptError}
            </div>
          )}
          {errorMessage && (
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
