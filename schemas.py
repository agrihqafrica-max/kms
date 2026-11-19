from decimal import Decimal
from datetime import date
from uuid import UUID

from pydantic import BaseModel, Field


class InventoryItemCreate(BaseModel):
    organization_id: UUID | None = None
    branch_id: UUID | None = None
    part_name: str = Field(min_length=1, max_length=255)
    part_number: str = Field(min_length=1, max_length=255)
    category: str | None = Field(default=None, max_length=255)
    compatible_models: list[str] | None = None
    unit_cost: Decimal = Field(gt=0, decimal_places=2)
    retail_price: Decimal = Field(gt=0, decimal_places=2)
    stock_quantity: int = Field(default=0, ge=0)
    reorder_level: int = Field(default=0, ge=0)


class CartItem(BaseModel):
    item_id: UUID
    quantity: int = Field(gt=0)


class POSCheckout(BaseModel):
    organization_id: UUID | None = None
    branch_id: UUID | None = None
    customer_phone: str | None = Field(default=None, max_length=50)
    customer_id: UUID | None = None
    payment_method: str = Field(min_length=1, max_length=50)
    mpesa_receipt_number: str | None = Field(default=None, max_length=255)
    discount_amount: Decimal = Field(default=Decimal("0.00"), ge=0, decimal_places=2)
    cart: list[CartItem] = Field(min_length=1)


class DailyExpenseCreate(BaseModel):
    organization_id: UUID | None = None
    branch_id: UUID | None = None
    category: str = Field(min_length=1, max_length=255)
    amount: Decimal = Field(gt=0, decimal_places=2)
    description: str | None = None
    expense_date: date


class EODCreate(BaseModel):
    organization_id: UUID | None = None
    branch_id: UUID | None = None
    reconciliation_date: date
    total_gross_sales: Decimal | None = None
    total_cogs: Decimal | None = Field(default=None, ge=0, decimal_places=2)
    total_expenses: Decimal | None = Field(default=None, ge=0, decimal_places=2)
    cash_expected: Decimal = Field(default=Decimal("0.00"), ge=0, decimal_places=2)
    cash_counted: Decimal | None = Field(default=None, ge=0, decimal_places=2)
    is_approved: bool = False


class OrganizationRegistration(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    kra_pin: str | None = Field(default=None, max_length=50)
    org_type: str = Field(pattern="^(IMPORTER|WHOLESALER|RETAIL|MECHANIC|CUSTOMER)$")
    subscription_tier: str = Field(default="standard", max_length=50)
    kra_compliance_enabled: bool = False
    payroll_compliance_enabled: bool = False


class PurchaseOrderCreate(BaseModel):
    supplier_id: UUID
    order_number: str = Field(min_length=1, max_length=100)
    items: list[dict]
    notes: str | None = None
    organization_id: UUID | None = None
    branch_id: UUID | None = None


class ResolvePurchaseOrder(BaseModel):
    approve: bool


class GoodsReceiptCreate(BaseModel):
    purchase_order_id: UUID
    receipt_reference: str = Field(min_length=1, max_length=100)
    items: list[dict]


class BranchTransferCreate(BaseModel):
    destination_branch_id: UUID
    items: list[dict]
    organization_id: UUID | None = None
    source_branch_id: UUID | None = None


class ResolveBranchTransfer(BaseModel):
    approve: bool


class DispatchBranchTransfer(BaseModel):
    rider_name: str = Field(min_length=1, max_length=255)
    rider_phone: str = Field(min_length=1, max_length=50)
    motorbike_number_plate: str = Field(min_length=1, max_length=50)


class SalesReturnCreate(BaseModel):
    order_id: UUID
    reason: str = Field(min_length=1)
    items: list[dict]


class ResolveSalesReturn(BaseModel):
    approve: bool
    refund_method: str = Field(default="cash", max_length=50)
