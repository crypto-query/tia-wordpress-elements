<?php
/**
 * The Access Cut-off: the year-end rule and the cut-off of each access.
 *
 * @package tia-wordpress-elements
 */

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../includes/class-tia-elements-access.php';
require_once __DIR__ . '/../../includes/class-tia-elements-access-resolver.php';

/**
 * Exercises TIA_Elements_Access_Resolver::year_end_cutoff() and TIA_Elements_Access::cutoff().
 */
final class CutoffTest extends TestCase {

	/**
	 * A UTC date as a UTC epoch.
	 *
	 * @param string $date A date such as `2027-01-01 00:00`.
	 */
	private static function utc( string $date ): int {
		return ( new DateTimeImmutable( $date, new DateTimeZone( 'UTC' ) ) )->getTimestamp();
	}

	/**
	 * The cut-off for a subscription start and period end.
	 *
	 * @param string $created    When the subscription started, UTC.
	 * @param string $period_end When the paid period ends, UTC.
	 * @param string $want       The cut-off, UTC.
	 */
	#[DataProvider( 'year_end_cases' )]
	public function test_year_end_rule( string $created, string $period_end, string $want ): void {
		$this->assertSame( gmdate( 'Y-m-d H:i', self::utc( $want ) ), gmdate( 'Y-m-d H:i', TIA_Elements_Access_Resolver::year_end_cutoff( self::utc( $created ), self::utc( $period_end ) ) ) );
	}

	/**
	 * Start, period end and the cut-off, all UTC.
	 *
	 * @return array<string, array{string, string, string}>
	 */
	public static function year_end_cases(): array {
		return array(
			'15 Mar to 1 Mar next year is m = 12: Dec 31' => array( '2026-03-15 10:00', '2027-03-01 10:00', '2027-12-31 00:00' ),
			'period end exactly 2027-01-01, m = 12'       => array( '2026-01-01 00:00', '2027-01-01 00:00', '2027-12-31 00:00' ),
			'period end exactly 2027-01-01, m = 10'       => array( '2026-03-01 00:00', '2027-01-01 00:00', '2027-02-01 00:00' ),
			'm = 11 adds one month'                       => array( '2026-02-10 08:30', '2027-01-10 08:30', '2027-02-10 08:30' ),
			'31 Jan + 1 month rolls over to early March'  => array( '2026-12-01 00:00', '2027-01-31 12:00', '2027-03-03 12:00' ),
			'31 Jan + 1 month in a leap year'             => array( '2027-12-01 00:00', '2028-01-31 12:00', '2028-03-02 12:00' ),
			'monthly payer in month 12 gets one more month' => array( '2026-01-10 00:00', '2026-12-10 00:00', '2027-01-10 00:00' ),
			'monthly payer in month 13 gets Dec 31'       => array( '2026-01-10 00:00', '2027-02-10 00:00', '2027-12-31 00:00' ),
			'the day of month is ignored'                 => array( '2026-01-31 00:00', '2027-01-01 00:00', '2027-12-31 00:00' ),
			'TIA Elite three years ahead'                 => array( '2027-01-01 00:00', '2030-01-01 00:00', '2030-12-31 00:00' ),
		);
	}

	/**
	 * A Trial is cut off at the trial end; full access by the year-end rule; without dates, never.
	 */
	public function test_cutoff_per_access(): void {
		$created    = self::utc( '2026-01-10 00:00' );
		$period_end = self::utc( '2027-02-10 00:00' );

		$this->assertSame( 1_900_000_000, TIA_Elements_Access::trial( 'tia-pro', 1_900_000_000 )->cutoff() );
		$this->assertSame( self::utc( '2027-12-31 00:00' ), TIA_Elements_Access::full( 'indicator-suite', $created, $period_end )->cutoff() );
		$this->assertNull( TIA_Elements_Access::full()->cutoff() );
		$this->assertNull( TIA_Elements_Access::full( 'tia-pro' )->cutoff() );
		$this->assertNull( TIA_Elements_Access::full( 'tia-pro', $created, null )->cutoff() );
		$this->assertNull( TIA_Elements_Access::denied()->cutoff() );
		$this->assertNull( TIA_Elements_Access::unavailable()->cutoff() );
	}
}
