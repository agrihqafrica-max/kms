from datetime import date, datetime
from decimal import Decimal
from uuid import uuid4

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


def uuid_pk():
    return mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)


class Organization(Base):
    __tablename__ = "organizations"
    id: Mapped[str] = uuid_pk()
    name: Mapped[str] = mapped_column(String, nullable=False)
    kra_pin: Mapped[str | None] = mapped_column(String)
    subscription_tier: Mapped[str | None] = mapped_column(String)
    is_active: Mapped[bool | None] = mapped_column(Boolean)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())
    org_type: Mapped[str] = mapped_column(String, nullable=False, default="RETAIL")
    kra_compliance_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    payroll_compliance_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    branches: Mapped[list["Branch"]] = relationship(back_populates="organization")
    users: Mapped[list["User"]] = relationship(back_populates="organization")


class Branch(Base):
    __tablename__ = "branches"
    id: Mapped[str] = uuid_pk()
    organization_id: Mapped[str] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    branch_name: Mapped[str] = mapped_column(String, nullable=False)
    county: Mapped[str] = mapped_column(String, nullable=False)
    location_description: Mapped[str | None] = mapped_column(Text)
    phone_number: Mapped[str | None] = mapped_column(String)
    is_main_hub: Mapped[bool | None] = mapped_column(Boolean)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())

    organization: Mapped[Organization] = relationship(back_populates="branches")
    users: Mapped[list["User"]] = relationship(back_populates="branch")
    inventory: Mapped[list["BranchInventory"]] = relationship(back_populates="branch")


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = uuid_pk()
    organization_id: Mapped[str] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    branch_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True), ForeignKey("branches.id"))
    full_name: Mapped[str] = mapped_column(String, nullable=False)
    email: Mapped[str] = mapped_column(String, nullable=False)
    phone_number: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False)
    auth_user_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    pin_code_hash: Mapped[str | None] = mapped_column(String)
    is_active: Mapped[bool | None] = mapped_column(Boolean)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())

    organization: Mapped[Organization] = relationship(back_populates="users")
    branch: Mapped[Branch | None] = relationship(back_populates="users")


class BranchInventory(Base):
    __tablename__ = "branch_inventory"
    id: Mapped[str] = uuid_pk()
    organization_id: Mapped[str] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    branch_id: Mapped[str] = mapped_column(UUID(as_uuid=True), ForeignKey("branches.id"), nullable=False)
    part_name: Mapped[str] = mapped_column(String, nullable=False)
    part_number: Mapped[str] = mapped_column(String, nullable=False)
    category: Mapped[str | None] = mapped_column(String)
    compatible_models: Mapped[list[str] | None] = mapped_column(ARRAY(String))
    unit_cost: Mapped[Decimal] = mapped_column(Numeric, nullable=False)
    retail_price: Mapped[Decimal] = mapped_column(Numeric, nullable=False)
    stock_quantity: Mapped[int | None] = mapped_column(Integer)
    reorder_level: Mapped[int | None] = mapped_column(Integer)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())

    branch: Mapped[Branch] = relationship(back_populates="inventory")


class SalesOrder(Base):
    __tablename__ = "sales_orders"
    id: Mapped[str] = uuid_pk()
    organization_id: Mapped[str] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    branch_id: Mapped[str] = mapped_column(UUID(as_uuid=True), ForeignKey("branches.id"), nullable=False)
    cashier_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    mechanic_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True), ForeignKey("mechanics_directory.id"))
    customer_phone: Mapped[str | None] = mapped_column(String)
    subtotal: Mapped[Decimal] = mapped_column(Numeric, nullable=False)
    vat_amount: Mapped[Decimal] = mapped_column(Numeric, nullable=False)
    discount_amount: Mapped[Decimal | None] = mapped_column(Numeric)
    total_amount: Mapped[Decimal] = mapped_column(Numeric, nullable=False)
    payment_method: Mapped[str] = mapped_column(String, nullable=False)
    mpesa_receipt_number: Mapped[str | None] = mapped_column(String)
    kra_vscu_signature: Mapped[str | None] = mapped_column(Text)
    is_synced: Mapped[bool | None] = mapped_column(Boolean)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())

    items: Mapped[list["SalesOrderItem"]] = relationship(back_populates="sales_order", cascade="all, delete-orphan")


class SalesOrderItem(Base):
    __tablename__ = "sales_order_items"
    id: Mapped[str] = uuid_pk()
    order_id: Mapped[str] = mapped_column(UUID(as_uuid=True), ForeignKey("sales_orders.id"), nullable=False)
    inventory_id: Mapped[str] = mapped_column(UUID(as_uuid=True), ForeignKey("branch_inventory.id"), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric, nullable=False)
    total_price: Mapped[Decimal] = mapped_column(Numeric, nullable=False)

    sales_order: Mapped[SalesOrder] = relationship(back_populates="items")


class DailyExpense(Base):
    __tablename__ = "daily_expenses"
    id: Mapped[str] = uuid_pk()
    organization_id: Mapped[str] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    branch_id: Mapped[str] = mapped_column(UUID(as_uuid=True), ForeignKey("branches.id"), nullable=False)
    recorded_by_user_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    category: Mapped[str] = mapped_column(String, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    expense_date: Mapped[date | None] = mapped_column(Date)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())


class EODReconciliation(Base):
    __tablename__ = "eod_reconciliations"
    id: Mapped[str] = uuid_pk()
    organization_id: Mapped[str] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    branch_id: Mapped[str] = mapped_column(UUID(as_uuid=True), ForeignKey("branches.id"), nullable=False)
    manager_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    reconciliation_date: Mapped[date | None] = mapped_column(Date)
    total_gross_sales: Mapped[Decimal | None] = mapped_column(Numeric)
    total_cogs: Mapped[Decimal | None] = mapped_column(Numeric)
    total_expenses: Mapped[Decimal | None] = mapped_column(Numeric)
    net_profit: Mapped[Decimal | None] = mapped_column(Numeric)
    cash_expected: Mapped[Decimal | None] = mapped_column(Numeric)
    cash_counted: Mapped[Decimal | None] = mapped_column(Numeric)
    variance: Mapped[Decimal | None] = mapped_column(Numeric)
    is_approved: Mapped[bool | None] = mapped_column(Boolean)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())


class MechanicsDirectory(Base):
    __tablename__ = "mechanics_directory"
    id: Mapped[str] = uuid_pk()
    organization_id: Mapped[str] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    mechanic_name: Mapped[str] = mapped_column(String, nullable=False)
    phone_number: Mapped[str] = mapped_column(String, nullable=False)
    county: Mapped[str] = mapped_column(String, nullable=False)
    workshop_location: Mapped[str | None] = mapped_column(Text)
    rating: Mapped[Decimal | None] = mapped_column(Numeric)
    is_verified: Mapped[bool | None] = mapped_column(Boolean)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())


class DispatchManifest(Base):
    __tablename__ = "dispatch_manifests"
    id: Mapped[str] = uuid_pk()
    organization_id: Mapped[str] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    source_branch_id: Mapped[str] = mapped_column(UUID(as_uuid=True), ForeignKey("branches.id"), nullable=False)
    destination_branch_id: Mapped[str] = mapped_column(UUID(as_uuid=True), ForeignKey("branches.id"), nullable=False)
    rider_name: Mapped[str] = mapped_column(String, nullable=False)
    rider_phone: Mapped[str] = mapped_column(String, nullable=False)
    motorbike_number_plate: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str | None] = mapped_column(String)
    dispatched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class InboundContainer(Base):
    __tablename__ = "inbound_containers"
    id: Mapped[str] = uuid_pk()
    organization_id: Mapped[str] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    container_number: Mapped[str] = mapped_column(String, nullable=False)
    origin_port: Mapped[str | None] = mapped_column(String)
    shipping_line: Mapped[str | None] = mapped_column(String)
    estimated_arrival_date: Mapped[date | None] = mapped_column(Date)
    actual_arrival_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str | None] = mapped_column(String)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PartsRadarRequest(Base):
    __tablename__ = "parts_radar_requests"
    id: Mapped[str] = uuid_pk()
    organization_id: Mapped[str] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    requesting_branch_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True), ForeignKey("branches.id"))
    part_description: Mapped[str] = mapped_column(Text, nullable=False)
    motorcycle_model: Mapped[str | None] = mapped_column(String)
    urgency_status: Mapped[str | None] = mapped_column(String)
    status: Mapped[str | None] = mapped_column(String, server_default="Open")
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PartsRadarQuote(Base):
    __tablename__ = "parts_radar_quotes"
    id: Mapped[str] = uuid_pk()
    request_id: Mapped[str] = mapped_column(UUID(as_uuid=True), ForeignKey("parts_radar_requests.id"), nullable=False)
    responding_organization_id: Mapped[str] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    quoted_price: Mapped[Decimal] = mapped_column(Numeric, nullable=False)
    available_quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    delivery_lead_time_hours: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str | None] = mapped_column(String, server_default="Pending")
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())


class BuyerPickupAnalytic(Base):
    __tablename__ = "buyer_pickup_analytics"
    id: Mapped[str] = uuid_pk()
    organization_id: Mapped[str] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    branch_id: Mapped[str] = mapped_column(UUID(as_uuid=True), ForeignKey("branches.id"), nullable=False)
    order_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True), ForeignKey("sales_orders.id"))
    customer_identifier: Mapped[str | None] = mapped_column(String)
    processing_time_minutes: Mapped[int | None] = mapped_column(Integer)
    pickup_status: Mapped[str | None] = mapped_column(String)
    recorded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())


class MonthlyPayoutBatch(Base):
    __tablename__ = "monthly_payout_batches"
    id: Mapped[str] = uuid_pk()
    organization_id: Mapped[str] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    batch_reference: Mapped[str] = mapped_column(String, nullable=False)
    total_payout_amount: Mapped[Decimal] = mapped_column(Numeric, nullable=False)
    status: Mapped[str | None] = mapped_column(String)
    disbursed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PayoutLineItem(Base):
    __tablename__ = "payout_line_items"
    id: Mapped[str] = uuid_pk()
    batch_id: Mapped[str] = mapped_column(UUID(as_uuid=True), ForeignKey("monthly_payout_batches.id"), nullable=False)
    recipient_name: Mapped[str] = mapped_column(String, nullable=False)
    recipient_phone: Mapped[str] = mapped_column(String, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric, nullable=False)
    status: Mapped[str | None] = mapped_column(String)
    mpesa_transaction_id: Mapped[str | None] = mapped_column(String)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[str] = uuid_pk()
    organization_id: Mapped[str] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    user_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    action_type: Mapped[str] = mapped_column(String, nullable=False)
    details: Mapped[dict | None] = mapped_column(JSONB)
    ip_address: Mapped[str | None] = mapped_column(String)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())


class WhatsAppThread(Base):
    __tablename__ = "whatsapp_threads"
    id: Mapped[str] = uuid_pk()
    organization_id: Mapped[str] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    customer_phone: Mapped[str] = mapped_column(String, nullable=False)
    customer_name: Mapped[str | None] = mapped_column(String)
    status: Mapped[str | None] = mapped_column(String)
    last_message_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class WhatsAppMessage(Base):
    __tablename__ = "whatsapp_messages"
    id: Mapped[str] = uuid_pk()
    thread_id: Mapped[str] = mapped_column(UUID(as_uuid=True), ForeignKey("whatsapp_threads.id"), nullable=False)
    sender_type: Mapped[str] = mapped_column(String, nullable=False)
    message_body: Mapped[str] = mapped_column(Text, nullable=False)
    media_url: Mapped[str | None] = mapped_column(Text)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())
