import { Id } from "@/convex/_generated/dataModel";
import { useState, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

type DrawerOcrData = {
  receipt_url: string;
  extracted: {
    description?: string;
    category?: string;
    amount?: number;
    currency?: string;
    expense_date?: string;
  };
  raw: unknown;
  confidence: number;
};

type ExpenseDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  expenseId: Id<"expenses"> | null;
  ocrData: DrawerOcrData | null;
};

export function ExpenseDrawer({ isOpen, onClose, expenseId, ocrData }: ExpenseDrawerProps) {
  // Use a query to fetch the specific expense if we are viewing one
  const myExpenses = useQuery(api.expenses.getMyExpenses, {}) || [];
  const existingExpense = myExpenses.find(e => e._id === expenseId);

  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Software");
  const [amount, setAmount] = useState<number | "">("");
  const [currency, setCurrency] = useState("USD");
  const [expenseDate, setExpenseDate] = useState("");
  const [paidBy, setPaidBy] = useState("Self");
  const [remarks, setRemarks] = useState("");
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);

  const createDraft = useMutation(api.expenses.createDraftExpense);
  const updateDraft = useMutation(api.expenses.updateDraftExpense);
  const submitDraft = useMutation(api.expenses.submitDraftExpense);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const normalizedOcrData =
    ocrData &&
    typeof ocrData.confidence === "number" &&
    ocrData.extracted !== undefined
      ? {
          extracted: ocrData.extracted,
          raw: ocrData.raw,
          confidence: ocrData.confidence,
        }
      : undefined;

  // Sync data when the drawer opens
  useEffect(() => {
    if (isOpen) {
      if (existingExpense) {
        setDescription(existingExpense.description || "");
        setCategory(existingExpense.category || "Software");
        setAmount(existingExpense.amount || "");
        setCurrency(existingExpense.currency || "USD");
        setExpenseDate(existingExpense.expense_date || "");
        setPaidBy(existingExpense.paid_by || "Self");
        setRemarks(existingExpense.remarks || "");
        setReceiptUrl(existingExpense.receipt_url || null);
      } else if (ocrData) {
        // Init from OCR
        setDescription(ocrData.extracted?.description || "");
        setCategory(ocrData.extracted?.category || "Meals");
        setAmount(ocrData.extracted?.amount || "");
        setCurrency(ocrData.extracted?.currency || "USD");
        setExpenseDate(ocrData.extracted?.expense_date || "");
        setPaidBy("Self");
        setRemarks("");
        setReceiptUrl(ocrData.receipt_url || null);
      } else {
        // Blank new expense
        setDescription("");
        setCategory("Software");
        setAmount("");
        setCurrency("USD");
        setExpenseDate(new Date().toISOString().split("T")[0]);
        setPaidBy("Self");
        setRemarks("");
        setReceiptUrl(null);
      }
    }
  }, [isOpen, existingExpense, ocrData]);

  if (!isOpen) return null;

  const isReadOnly = existingExpense && existingExpense.status !== "draft";

  const handleSaveAsDraft = async () => {
    setIsSubmitting(true);
    try {
      if (existingExpense) {
        await updateDraft({
          expense_id: existingExpense._id,
          updates: { description, category, amount: Number(amount), currency, expense_date: expenseDate, paid_by: paidBy, remarks, receipt_url: receiptUrl ?? undefined }
        });
      } else {
        await createDraft({
          description,
          category,
          amount: Number(amount),
          currency,
          expense_date: expenseDate,
          paid_by: paidBy,
          remarks,
          receipt_url: receiptUrl ?? undefined,
          ocr_data: normalizedOcrData,
        });
      }
      onClose();
    } catch (e) {
      console.error(e);
      alert("Failed to save draft");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      let submitId = existingExpense?._id;
      if (!submitId) {
        // Need to create draft first before submitting
        submitId = await createDraft({
          description,
          category,
          amount: Number(amount),
          currency,
          expense_date: expenseDate,
          paid_by: paidBy,
          remarks,
          receipt_url: receiptUrl ?? undefined,
          ocr_data: normalizedOcrData,
        });
      } else {
        // Ensure latest changes to draft are updated
        await updateDraft({
          expense_id: submitId,
          updates: { description, category, amount: Number(amount), currency, expense_date: expenseDate, paid_by: paidBy, remarks, receipt_url: receiptUrl ?? undefined }
        });
      }
      await submitDraft({ expense_id: submitId });
      onClose();
    } catch (e) {
      console.error(e);
      alert("Failed to submit expense");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* Backdrop overlay */}
      <div 
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, backgroundColor: 'var(--mac-glass-border)', backdropFilter: 'blur(2px)', zIndex: 100 }}
      />
      {/* Drawer */}
      <div 
        className="mac-card mac-fade-in"
        style={{ 
          position: 'fixed', right: 0, top: 0, bottom: 0, width: '100%', maxWidth: 500, 
          height: '100vh', zIndex: 101, display: 'flex', flexDirection: 'column', 
          borderLeft: '1px solid var(--mac-border)', borderRadius: '0', padding: 0
        }}
      >
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--mac-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--mac-glass)' }}>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--mac-text-primary)' }}>
              {isReadOnly ? "View Expense" : existingExpense ? "Edit Draft" : "New Expense"}
            </h3>
            {existingExpense && (
              <span className={`mac-badge mac-badge-${existingExpense.status === 'draft' ? 'grey' : existingExpense.status === 'approved' ? 'green' : existingExpense.status === 'rejected' ? 'red' : 'yellow'}`} style={{ marginTop: 4 }}>
                {existingExpense.status.toUpperCase()}
              </span>
            )}
          </div>
          <button className="mac-btn" onClick={onClose} style={{ padding: '4px 8px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
          
          {receiptUrl ? (
            <div style={{ padding: 12, background: 'var(--mac-bg)', borderRadius: 8, border: '1px solid var(--mac-border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--mac-text-secondary)', fontWeight: 500 }}>Attached Receipt</span>
              <a href={receiptUrl} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: 'var(--mac-accent)', textDecoration: 'none' }}>
                View Document ↗
              </a>
            </div>
          ) : !isReadOnly && (
             <div style={{ padding: 24, border: '2px dashed var(--mac-border-strong)', borderRadius: 8, textAlign: 'center', color: 'var(--mac-text-secondary)', fontSize: 13 }}>
               No receipt attached. You can securely attach one from the dashboard action bar.
             </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Left side */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label className="mac-label">Description</label>
                <input className="mac-input" value={description} onChange={e => setDescription(e.target.value)} disabled={isReadOnly} />
              </div>
              <div>
                <label className="mac-label">Category</label>
                <select className="mac-select" value={category} onChange={e => setCategory(e.target.value)} disabled={isReadOnly}>
                  <option value="Software">Software</option>
                  <option value="Meals">Meals</option>
                  <option value="Travel">Travel</option>
                  <option value="Hardware">Hardware</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="mac-label">Total Amount</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select className="mac-select" value={currency} onChange={e => setCurrency(e.target.value)} disabled={isReadOnly} style={{ width: 80 }}>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                  </select>
                  <input className="mac-input" type="number" value={amount} onChange={e => setAmount(e.target.value ? Number(e.target.value) : "")} disabled={isReadOnly} style={{ flex: 1 }} />
                </div>
              </div>
            </div>

            {/* Right side */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label className="mac-label">Expense Date</label>
                <input className="mac-input" type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)} disabled={isReadOnly} />
              </div>
              <div>
                <label className="mac-label">Paid By</label>
                <select className="mac-select" value={paidBy} onChange={e => setPaidBy(e.target.value)} disabled={isReadOnly}>
                  <option value="Self">Self (Reimbursable)</option>
                  <option value="Corporate Card">Corporate Card</option>
                  <option value="Company">Company Directed</option>
                </select>
              </div>
              <div>
                <label className="mac-label">Remarks (Optional)</label>
                <textarea className="mac-input" value={remarks} onChange={e => setRemarks(e.target.value)} disabled={isReadOnly} rows={3} style={{ resize: 'none' }} />
              </div>
            </div>
          </div>

          {/* Approval Chain if pending or approved */}
          {existingExpense && (existingExpense.status === "pending" || existingExpense.status === "approved" || existingExpense.status === "rejected") && (
            <div style={{ marginTop: 12 }}>
              <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--mac-text-primary)', marginBottom: 12 }}>Approval Status</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {existingExpense.approvers && existingExpense.approvers.length > 0 ? (
                  existingExpense.approvers.map((app, idx: number) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--mac-bg)', borderRadius: 6, border: '1px solid var(--mac-border)' }}>
                      <span style={{ fontSize: 13, color: 'var(--mac-text-primary)' }}>{app.name || "Unknown"}</span>
                      <span className={`mac-badge mac-badge-${app.status === 'pending' ? 'yellow' : app.status === 'approved' ? 'green' : app.status === 'rejected' ? 'red' : 'grey'}`}>
                        {app.status}
                      </span>
                    </div>
                  ))
                ) : (
                  <div style={{ fontSize: 13, color: 'var(--mac-text-secondary)' }}>No approval chain required.</div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--mac-border)', display: 'flex', justifyContent: 'flex-end', gap: 12, background: 'var(--mac-bg)' }}>
          {isReadOnly ? (
             <button className="mac-btn" onClick={onClose}>Close</button>
          ) : (
            <>
              <button className="mac-btn" onClick={handleSaveAsDraft} disabled={isSubmitting}>Save as Draft</button>
              <button className="mac-btn-primary" onClick={handleSubmit} disabled={isSubmitting || !amount || !description}>
                {isSubmitting ? "Submitting..." : "Submit Expense"}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
