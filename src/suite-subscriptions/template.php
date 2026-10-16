<?php
/**
 * The Suite Subscriptions table. It reuses the WooCommerce Subscriptions table classes,
 * so WooCommerce and the theme draw it; the style only lines the two tables up.
 *
 * @package tia-wordpress-elements
 *
 * @var list<array{status: string, next: string, note: string, total: string}> $rows The rows, `total` as HTML.
 */

defined( 'ABSPATH' ) || exit;
?>
<style>
	.white-panel:has(.tia-suite-subscriptions) .no_subscriptions { display: none; }
	.white-panel:has(.tia-suite-subscriptions) :is(.woocommerce-MyAccount-subscriptions, .tia-suite-subscriptions) { table-layout: fixed; }
	.white-panel:has(.tia-suite-subscriptions) :is(.woocommerce-MyAccount-subscriptions, .tia-suite-subscriptions) th { box-sizing: border-box; }
	.white-panel:has(.tia-suite-subscriptions) :is(.woocommerce-MyAccount-subscriptions, .tia-suite-subscriptions) th:nth-child(1) { width: 22%; }
	.white-panel:has(.tia-suite-subscriptions) :is(.woocommerce-MyAccount-subscriptions, .tia-suite-subscriptions) th:nth-child(2) { width: 18%; }
	.white-panel:has(.tia-suite-subscriptions) :is(.woocommerce-MyAccount-subscriptions, .tia-suite-subscriptions) th:nth-child(3) { width: 28%; }
	.white-panel:has(.tia-suite-subscriptions) :is(.woocommerce-MyAccount-subscriptions, .tia-suite-subscriptions) th:nth-child(4) { width: 20%; }
	@media (min-width: 769px) {
		.white-panel:has(.tia-suite-subscriptions) .tia-suite-subscriptions tbody tr { height: 51.4px; }
	}
	@media (max-width: 768px) {
		.white-panel:has(.tia-suite-subscriptions) .tia-suite-subscriptions td.order-actions { display: none; }
	}
</style>
<table class="tia-suite-subscriptions my_account_orders woocommerce-orders-table shop_table shop_table_responsive woocommerce-orders-table--subscriptions">
	<caption class="screen-reader-text"><?php esc_html_e( 'TIA Indicator Suite subscriptions', 'tia-wordpress-elements' ); ?></caption>
	<thead>
		<tr>
			<th scope="col" class="subscription-id order-number woocommerce-orders-table__header woocommerce-orders-table__header-order-number"><span class="nobr"><?php esc_html_e( 'Subscription', 'tia-wordpress-elements' ); ?></span></th>
			<th scope="col" class="subscription-status order-status woocommerce-orders-table__header woocommerce-orders-table__header-order-status"><span class="nobr"><?php esc_html_e( 'Status', 'tia-wordpress-elements' ); ?></span></th>
			<th scope="col" class="subscription-next-payment order-date woocommerce-orders-table__header woocommerce-orders-table__header-order-date"><span class="nobr"><?php esc_html_e( 'Next payment', 'tia-wordpress-elements' ); ?></span></th>
			<th scope="col" class="subscription-total order-total woocommerce-orders-table__header woocommerce-orders-table__header-order-total"><span class="nobr"><?php esc_html_e( 'Total', 'tia-wordpress-elements' ); ?></span></th>
			<th scope="col" class="subscription-actions order-actions woocommerce-orders-table__header woocommerce-orders-table__header-order-actions">&nbsp;</th>
		</tr>
	</thead>
	<tbody>
		<?php foreach ( $rows as $tia_row ) : ?>
			<tr class="order woocommerce-orders-table__row">
				<td class="subscription-id order-number woocommerce-orders-table__cell woocommerce-orders-table__cell-order-number" data-title="<?php esc_attr_e( 'Subscription', 'tia-wordpress-elements' ); ?>">TIA Indicator Suite</td>
				<td class="subscription-status order-status woocommerce-orders-table__cell woocommerce-orders-table__cell-order-status" data-title="<?php esc_attr_e( 'Status', 'tia-wordpress-elements' ); ?>"><?php echo esc_html( $tia_row['status'] ); ?></td>
				<td class="subscription-next-payment order-date woocommerce-orders-table__cell woocommerce-orders-table__cell-order-date" data-title="<?php esc_attr_e( 'Next Payment', 'tia-wordpress-elements' ); ?>">
					<?php echo esc_html( $tia_row['next'] ); ?>
					<?php if ( '' !== $tia_row['note'] ) : ?>
						<br/><small><?php echo esc_html( $tia_row['note'] ); ?></small>
					<?php endif; ?>
				</td>
				<td class="subscription-total order-total woocommerce-orders-table__cell woocommerce-orders-table__cell-order-total" data-title="<?php esc_attr_e( 'Total', 'tia-wordpress-elements' ); ?>"><?php echo wp_kses_post( $tia_row['total'] ); ?></td>
				<td class="subscription-actions order-actions woocommerce-orders-table__cell woocommerce-orders-table__cell-order-actions"></td>
			</tr>
		<?php endforeach; ?>
	</tbody>
</table>
