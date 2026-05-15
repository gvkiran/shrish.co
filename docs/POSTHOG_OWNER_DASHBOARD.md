# Shrish PostHog Owner Dashboard

This dashboard is meant to answer owner questions in plain English.

## Top Scorecards

1. **Website Visitors**
   - Insight type: Trends
   - Event: `page_viewed`
   - Count: Unique users

2. **Shop Visitors**
   - Insight type: Trends
   - Event: `shop_viewed`
   - Count: Unique users

3. **Products Viewed**
   - Insight type: Trends
   - Event: `product_details_opened`
   - Count: Total events

4. **Added to Cart**
   - Insight type: Trends
   - Event: `product_added_to_cart`
   - Count: Unique users

5. **Checkout Started**
   - Insight type: Trends
   - Event: `checkout_started`
   - Count: Unique users

6. **Orders Submitted**
   - Insight type: Trends
   - Event: `order_submitted`
   - Count: Unique users

## Main Funnel

Name: **Shopping Funnel**

Steps:
1. `page_viewed`
2. `shop_viewed`
3. `product_details_opened`
4. `product_added_to_cart`
5. `checkout_started`
6. `order_submitted`

Use this to see where customers drop off.

## Useful Tables

### Most Viewed Products
- Insight type: Trends
- Event: `product_details_opened`
- Breakdown: `product_title`
- Display: Bar chart

### Most Added Products
- Insight type: Trends
- Event: `product_added_to_cart`
- Breakdown: `product_title`
- Display: Bar chart

### What Customers Search
- Insight type: Trends
- Event: `product_search_performed`
- Breakdown: `results_count`
- Display: Table or bar chart

### Best Pickup Location Interest
- Insight type: Trends
- Event: `pickup_location_selected`
- Breakdown: `pickup_location`
- Display: Bar chart

### Geet Usage
- Insight type: Trends
- Events:
  - `geet_opened`
  - `geet_question_answered`
  - `geet_chip_clicked`
- Display: Line chart

## Recommended Date Range

Use **Last 7 days** for day-to-day decisions.
Use **Last 30 days** for ad and product decisions.

