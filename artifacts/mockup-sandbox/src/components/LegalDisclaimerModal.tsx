import * as React from "react";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";
import { getCurrentUser } from "@/lib/session";

interface Props {
  activeRole: string;
  onBlockingChange?: (blocking: boolean) => void;
}

export function LegalDisclaimerModal({ activeRole, onBlockingChange }: Props) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [canAccept, setCanAccept] = React.useState(false);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const user = getCurrentUser();

  React.useEffect(() => {
    // Only apply to Student (Resident) role
    if (activeRole !== "Student" || !user) {
      onBlockingChange?.(false);
      return;
    }
    
    // Check if they've already accepted on this device
    const accepted = localStorage.getItem(`disclaimer_accepted_${user.id}`);
    if (!accepted) {
      setIsOpen(true);
      onBlockingChange?.(true);
      // Disable scrolling on the body behind the modal
      document.body.style.overflow = 'hidden';
    } else {
      onBlockingChange?.(false);
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [activeRole, user, onBlockingChange]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    // Add a 20px buffer to ensure they don't get stuck if zoom levels throw off precise pixel math
    if (scrollHeight - scrollTop - clientHeight < 20) {
      setCanAccept(true);
    }
  };

  // Auto-enable if the content is short enough not to require scrolling
  React.useEffect(() => {
    if (isOpen && contentRef.current) {
      if (contentRef.current.scrollHeight <= contentRef.current.clientHeight) {
        setCanAccept(true);
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAccept = () => {
    if (user) {
      localStorage.setItem(`disclaimer_accepted_${user.id}`, "true");
    }
    document.body.style.overflow = 'unset';
    setIsOpen(false);
    onBlockingChange?.(false);
  };

  // Note: No onClose handlers, no keyboard listeners, no click-outside. Strictly blocking.
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-deep/80 backdrop-blur-sm p-4 sm:p-6">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center gap-4 border-b border-line-soft bg-mist p-6 shrink-0">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-status">
            <ShieldAlert className="h-6 w-6 text-status-foreground" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-ink">Important Legal Disclaimer</h2>
            <p className="text-sm text-helper mt-1">Please read and accept the terms below to continue using the eLogbook.</p>
          </div>
        </div>
        
        {/* Scrollable Content */}
        <div 
          ref={contentRef}
          onScroll={handleScroll}
          className="p-6 md:p-8 overflow-y-auto flex-1 text-sm text-ink space-y-5"
        >
          <p className="font-bold text-ink uppercase text-center border-b border-line-soft pb-4 mb-6">
            Data Responsibility and Liability Disclaimer
          </p>
          
          <p>By accessing and using this eLogbook portal, you acknowledge and agree to the following:</p>
          
          <ol className="list-decimal pl-5 space-y-4">
            <li>
              You are solely responsible for any patient-related information, including but not limited to names, identifiers, demographic details, clinical history, or any other personally identifiable or sensitive information, that you choose to enter into this system.
            </li>
            <li>
              You are strongly advised to anonymize or de-identify all patient data before entry, in accordance with applicable medical ethics guidelines and data protection laws, including the Digital Personal Data Protection Act, 2023.
            </li>
            <li>
              The institution, its administrators, and the developers of this platform shall not be held liable for any loss, unauthorized access, disclosure, misuse, or breach of any patient data that you input into this system, to the fullest extent permitted by law.
            </li>
            <li>
              You agree to comply with all applicable laws, institutional policies, and medical council guidelines regarding patient confidentiality and data protection while using this portal.
            </li>
            <li>
              Any violation of patient confidentiality arising from data you have entered shall be your individual responsibility, and you may be held personally accountable under applicable law and institutional disciplinary procedures.
            </li>
          </ol>
          
          <p className="font-medium pt-4 text-ink">
            By clicking "I Accept and Agree" below, you confirm that you have read, understood, and agree to be bound by the above terms.
          </p>
        </div>

        {/* Footer / Actions */}
        <div className="border-t border-line-soft p-6 bg-mist flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0">
          <p className="text-xs text-helper font-medium">
            {!canAccept ? "↓ Please scroll to the bottom to accept" : "✓ Thank you for reading the disclaimer"}
          </p>
          <Button 
            onClick={handleAccept} 
            disabled={!canAccept}
            className="w-full sm:w-auto h-11 px-8 bg-deep hover:bg-deep transition-all"
          >
            I Accept and Agree
          </Button>
        </div>
        
      </div>
    </div>
  );
}
