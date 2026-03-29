"use client";

import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState, useRef } from "react";
import { Id } from "@/convex/_generated/dataModel";
import { ExpenseDrawer } from "./ExpenseDrawer";
import { Upload, Plus, FileText, Clock, CheckCircle, Trash2 } from "lucide-react";

type FilterMode = "all" | "draft" | "pending" | "approved";

type OcrResult = {
  success: boolean;
  receipt_url: string;
  extracted: {
    amount?: number;
    currency?: string;
    category?: string;
    expense_date?: string;
    description?: string;
  };
  raw: unknown;
  confidence: number;
};

export default function EmployeeDashboard() {
  const currentUser = useQuery(api.auth.current);
  const myExpenses = useQuery(api.expenses.getMyExpenses, currentUser ? {} : "skip") || [];

  const deleteDraft = useMutation(api.expenses.deleteDraftExpense);
  const generateUploadUrl = useMutation(api.ocr.generateUploadUrl);
  const processReceipt = useAction(api.ocr.processReceipt);

  const [filter, setFilter] = useState<FilterMode>("all");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedExpenseId, setSelectedExpenseId] = useState<Id<"expenses"> | null>(null);
  const [ocrData, setOcrData] = useState<OcrResult | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!currentUser) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "40px 0", color: "var(--mac-text-secondary)", fontSize: 13 }}>
        <div style={{ width: 18, height: 18, borderRadius: "50%", border: "2px solid var(--mac-border-strong)", borderTopColor: "var(--mac-accent)", animation: "spin 0.8s linear infinite" }} />
        Loading dashboard…
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Derived Summary Totals (simplified aggregation assuming USD primarily for prototype)
  const drafts = myExpenses.filter(e => e.status === "draft");
  const pending = myExpenses.filter(e => e.status === "pending");
  const approved = myExpenses.filter(e => e.status === "approved");

  const totalDraft = drafts.reduce((acc, curr) => acc + (curr.amount || 0), 0);
  const totalPending = pending.reduce((acc, curr) => acc + (curr.amount || 0), 0);
  const totalApproved = approved.reduce((acc, curr) => acc + (curr.amount || 0), 0);

  const filteredExpenses = myExpenses.filter(e => filter === "all" ? true : e.status === filter);

  // Handlers
  const handleOpenNew = () => {
    setSelectedExpenseId(null);
    setOcrData(null);
    setIsDrawerOpen(true);
  };

  const handleOpenExisting = (id: Id<"expenses">) => {
    setSelectedExpenseId(id);
    setOcrData(null);
    setIsDrawerOpen(true);
  };

  const handleDelete = async (e: React.MouseEvent, id: Id<"expenses">) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this draft?")) {
      await deleteDraft({ expense_id: id });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      // 1. Get Upload URL
      const uploadUrl = await generateUploadUrl();
      // 2. Upload file
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const { storageId } = await result.json();

      // 3. Process via OCR Action
      const extraction = await processReceipt({ storageId });
      
      if (extraction.success) {
        setOcrData(extraction);
        setSelectedExpenseId(null);
        setIsDrawerOpen(true);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to process receipt. OCR Error.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 60 }}>
      {/* Header & Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--mac-text-primary)", margin: 0 }}>
            Expenses
          </h2>
          <p style={{ fontSize: 13, color: "var(--mac-text-secondary)", marginTop: 4 }}>
            Submit, track, and manage your reimbursements.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          {/* Hidden File Input */}
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            accept="image/*,.pdf" 
            style={{ display: "none" }} 
          />
          <button 
            className="mac-btn" 
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            style={{ padding: "6px 14px" }}
          >
            {isUploading ? (
              <div style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid var(--mac-border-strong)", borderTopColor: "var(--mac-accent)", animation: "spin 0.8s linear infinite" }} />
            ) : (
              <Upload size={14} />
            )}
            {isUploading ? "Uploading..." : "Upload"}
          </button>
          <button className="mac-btn-primary" onClick={handleOpenNew} style={{ padding: "6px 14px" }}>
            <Plus size={14} />
            New
          </button>
        </div>
      </div>

      {/* Summary Strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        <div 
          onClick={() => setFilter(filter === "draft" ? "all" : "draft")}
          className="mac-card" 
          style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer', border: filter === 'draft' ? '2px solid var(--mac-accent)' : '1px solid var(--mac-border)' }}
        >
          <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--mac-accent-alpha)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mac-accent)' }}>
             <FileText size={20} />
          </div>
          <div>
            <div style={{ fontSize: 13, color: 'var(--mac-text-secondary)', fontWeight: 500 }}>To Submit</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--mac-text-primary)' }}>${totalDraft.toFixed(2)}</div>
          </div>
        </div>

        <div 
          onClick={() => setFilter(filter === "pending" ? "all" : "pending")}
          className="mac-card" 
          style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer', border: filter === 'pending' ? '2px solid var(--mac-yellow)' : '1px solid var(--mac-border)' }}
        >
          <div style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(254, 188, 46, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mac-yellow)' }}>
             <Clock size={20} />
          </div>
          <div>
            <div style={{ fontSize: 13, color: 'var(--mac-text-secondary)', fontWeight: 500 }}>Waiting Approval</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--mac-text-primary)' }}>${totalPending.toFixed(2)}</div>
          </div>
        </div>

        <div 
          onClick={() => setFilter(filter === "approved" ? "all" : "approved")}
          className="mac-card" 
          style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer', border: filter === 'approved' ? '2px solid var(--mac-green)' : '1px solid var(--mac-border)' }}
        >
          <div style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(40, 200, 64, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mac-green)' }}>
             <CheckCircle size={20} />
          </div>
          <div>
            <div style={{ fontSize: 13, color: 'var(--mac-text-secondary)', fontWeight: 500 }}>Approved Details</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--mac-text-primary)' }}>${totalApproved.toFixed(2)}</div>
          </div>
        </div>
      </div>

      {/* Expense Table */}
      <div className="mac-card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="mac-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Category</th>
              <th>Paid By</th>
              <th>Amount</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredExpenses.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: "40px 0", color: "var(--mac-text-secondary)" }}>
                  {filter === 'all' ? "No expenses found. Click 'New' or 'Upload' to create one." : `No ${filter} expenses found.`}
                </td>
              </tr>
            ) : (
              filteredExpenses.map((exp) => (
                <tr 
                  key={exp._id} 
                  onClick={() => handleOpenExisting(exp._id)}
                  style={{ cursor: 'pointer', transition: 'background 0.15s' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--mac-accent-alpha)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ color: 'var(--mac-text-secondary)', fontSize: 12 }}>{exp.expense_date || new Date().toISOString().split("T")[0]}</td>
                  <td style={{ fontWeight: 500, color: 'var(--mac-text-primary)' }}>{exp.description || "Untitled Expense"}</td>
                  <td>
                    <span style={{ fontSize: 12, padding: "2px 6px", background: 'var(--mac-bg)', border: '1px solid var(--mac-border)', borderRadius: 4 }}>
                      {exp.category}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--mac-text-secondary)' }}>{exp.paid_by || "Self"}</td>
                  <td style={{ fontWeight: 600 }}>{exp.currency} {exp.amount.toFixed(2)}</td>
                  <td>
                    <span className={`mac-badge mac-badge-${exp.status === 'draft' ? 'grey' : exp.status === 'approved' ? 'green' : exp.status === 'rejected' ? 'red' : 'yellow'}`}>
                      {exp.status.charAt(0).toUpperCase() + exp.status.slice(1)}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {exp.status === 'draft' ? (
                       <button 
                         className="mac-btn-danger" 
                         onClick={(e) => handleDelete(e, exp._id)}
                         style={{ padding: '4px 8px', fontSize: 12 }}
                       >
                         <Trash2 size={12} />
                       </button>
                    ) : (
                       <button className="mac-btn" style={{ padding: '4px 10px', fontSize: 12 }}>
                         View
                       </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ExpenseDrawer 
        isOpen={isDrawerOpen} 
        onClose={() => setIsDrawerOpen(false)} 
        expenseId={selectedExpenseId} 
        ocrData={ocrData}
      />
    </div>
  );
}
