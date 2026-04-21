import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, X, Package, Clock } from "lucide-react";
import { useCart } from "@/contexts/CartContext";

const OrderConfirmation = () => {
  const { showConfirmation, setShowConfirmation, lastOrder } = useCart();

  if (!lastOrder) return null;

  return (
    <AnimatePresence>
      {showConfirmation && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[200] bg-background/90 backdrop-blur-xl flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 30 }}
            className="bg-card border border-border/20 rounded-sm max-w-lg w-full p-8 relative max-h-[90vh] overflow-y-auto"
          >
            <button onClick={() => setShowConfirmation(false)} className="absolute top-4 right-4 p-2 hover:bg-accent rounded-sm transition-colors">
              <X className="w-5 h-5 text-foreground" />
            </button>

            <div className="text-center mb-8">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.2 }}>
                <CheckCircle className="w-16 h-16 mx-auto mb-4 text-success" />
              </motion.div>
              <h2 className="font-display text-2xl text-foreground mb-2">Order Confirmed!</h2>
              <p className="font-body text-sm text-muted-foreground">Thank you for your purchase</p>
              <p className="font-body text-xs text-muted-foreground mt-1">Order ID: {lastOrder.id}</p>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-muted/30 border border-border/10 rounded-sm">
                <div className="flex items-center gap-2 mb-3">
                  <Package className="w-4 h-4 text-muted-foreground" />
                  <p className="font-body text-xs tracking-wider uppercase text-muted-foreground">Items</p>
                </div>
                {lastOrder.items.map((item) => (
                  <div key={item.id} className="flex justify-between font-body text-xs text-foreground mb-1">
                    <span>{item.title} × {item.quantity}</span>
                    <span>₱{(item.price * item.quantity).toLocaleString()}</span>
                  </div>
                ))}
                <div className="border-t border-border/10 mt-3 pt-3">
                  <div className="flex justify-between font-body text-sm text-foreground font-semibold">
                    <span>Total Paid</span>
                    <span>₱{lastOrder.total.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {lastOrder.estimatedCreationDays && (
                <div className="flex items-center gap-2 p-3 bg-muted/20 border border-border/10 rounded-sm">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <p className="font-body text-xs text-muted-foreground">Estimated creation: {lastOrder.estimatedCreationDays}</p>
                </div>
              )}

              <p className="font-body text-xs text-center text-muted-foreground">
                A confirmation email has been sent to {lastOrder.orderInfo.email}
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default OrderConfirmation;
