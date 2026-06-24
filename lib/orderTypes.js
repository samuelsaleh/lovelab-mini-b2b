/**
 * Shared order type definitions.
 * Single source of truth — imported by OrderTypePicker and SaveDocumentModal.
 * To add a new channel: add one entry here + update CHANNEL_CONFIG in SaveDocumentModal.
 */
export const ORDER_TYPES = [
  {
    id: 'b2b',
    label: 'B2B Order',
    description: 'Standard client order — counted in revenue and analytics.',
    icon: '🧾',
  },
  {
    id: 'internal',
    label: 'Internal Order',
    description: 'Supplier or manufacturing order — not counted in revenue.',
    icon: '🏭',
  },
  {
    id: 'consignment',
    label: 'Consignment',
    description: 'Goods sent on consignment — tracked separately, not revenue.',
    icon: '📦',
  },
  {
    id: 'delete_from_stock',
    label: 'Delete from Stock',
    description: 'Write off gifted or lost items — product list + comment, no revenue.',
    icon: '🗑️',
  },
]
