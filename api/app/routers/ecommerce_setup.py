from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session as get_db
from app.crud.table import create_table
from app.crud.column import add_column
from app.crud.relation import add_relation
from app.models import TableType

router = APIRouter()

@router.post("/setup/{project_id}")
async def setup_ecommerce_store(
    project_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Generate a complete e-commerce database structure with:
    - Buyers (customers)
    - Products (catalog items)
    - Orders (purchase transactions)
    - Order Items (line items with copied product data)
    """
    
    # Create Buyers table
    buyers_table = await create_table(db, "Buyers", project_id)
    await add_column(db, buyers_table, name="email", ui_type="single_line_text")
    await add_column(db, buyers_table, name="phone", ui_type="single_line_text")
    await add_column(db, buyers_table, name="address", ui_type="single_line_text")
    await add_column(db, buyers_table, name="city", ui_type="single_line_text")
    await add_column(db, buyers_table, name="postal_code", ui_type="single_line_text")
    await add_column(db, buyers_table, name="country", ui_type="single_line_text")
    
    # Create Products table (master catalog)
    products_table = await create_table(db, "Products", project_id)
    await add_column(db, products_table, name="sku", ui_type="single_line_text")
    await add_column(db, products_table, name="description", ui_type="single_line_text")
    await add_column(db, products_table, name="base_price", ui_type="decimal", scale=2)
    await add_column(db, products_table, name="stock_quantity", ui_type="number")
    await add_column(db, products_table, name="category", ui_type="single_select")

    
    # Create Orders table
    orders_table = await create_table(db, "Orders", project_id)
    await add_column(db, orders_table, name="order_number", ui_type="single_line_text")
    await add_column(db, orders_table, name="subtotal", ui_type="decimal", scale=2)
    await add_column(db, orders_table, name="tax", ui_type="decimal", scale=2)
    await add_column(db, orders_table, name="shipping", ui_type="decimal", scale=2)
    await add_column(db, orders_table, name="total", ui_type="decimal", scale=2)
    await add_column(db, orders_table, name="payment_method", ui_type="single_select")
    await add_column(db, orders_table, name="notes", ui_type="single_line_text")
    
    # Create Order Items table (line items - copies product data at time of purchase)
    order_items_table = await create_table(db, "Order Items", project_id)
    await add_column(db, order_items_table, name="product_name", ui_type="single_line_text")  # Copied from product
    await add_column(db, order_items_table, name="product_sku", ui_type="single_line_text")  # Copied from product
    await add_column(db, order_items_table, name="unit_price", ui_type="decimal", scale=2)  # Copied/modified from product
    await add_column(db, order_items_table, name="quantity", ui_type="number")
    await add_column(db, order_items_table, name="discount_amount", ui_type="decimal", scale=2)  # Optional discount
    await add_column(db, order_items_table, name="line_total", ui_type="decimal", scale=2)  # (unit_price * quantity) - discount

    # Create relationships
    
    # Buyer -> Orders (one-to-many)
    buyer_orders_rel = await add_relation(
        db=db,
        left=buyers_table,
        right=orders_table,
        relation_type="one_to_many",
        display_name="Orders",
       
    )
    
    # Order -> Order Items (one-to-many)
    order_items_rel = await add_relation(
        db=db,
        left=orders_table,
        right=order_items_table,
        relation_type="one_to_many",
        display_name="Order Items",
      
    )
    
    # Product -> Order Items (one-to-many reference)
    # This maintains the link to the original product for reporting
    product_items_rel = await add_relation(
        db=db,
        left=products_table,
        right=order_items_table,
        relation_type="one_to_many",
        display_name="Product Reference"
    )
    
    await db.commit()
    
    return {
        "message": "E-commerce store structure created successfully",
        "tables": {
            "buyers": buyers_table.id,
            "products": products_table.id,
            "orders": orders_table.id,
            "order_items": order_items_table.id
        },
        "relationships": {
            "buyer_orders": buyer_orders_rel.id if buyer_orders_rel else None,
            "order_items": order_items_rel.id if order_items_rel else None,
            "product_references": product_items_rel.id if product_items_rel else None
        }
    }
