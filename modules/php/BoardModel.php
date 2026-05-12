<?php

declare(strict_types=1);

namespace Bga\Games\BorealisArticExpeditions;

use Bga\GameFramework\Components\Deck;
use Bga\GameFramework\UserException;

/**
 * Scientist positions, flags, locations helpers (serialized via Globals JSON).
 */
final class BoardModel
{
    public const POS_LEFT = 0;

    public const POS_MID = 1;

    public const POS_RIGHT = 2;

    public const POS_CAMP_L = 3;

    public const POS_CAMP_R = 4;

    /** @param array<int, array<int, list<int>>> $scientists playerId -> color -> list of 3 positions (one per meeple) */
    public static function initialScientists(array $playerIds): array
    {
        $out = [];
        foreach ($playerIds as $pid) {
            $out[$pid] = [
                0 => [self::POS_LEFT, self::POS_MID, self::POS_RIGHT],
                1 => [self::POS_LEFT, self::POS_MID, self::POS_RIGHT],
                2 => [self::POS_LEFT, self::POS_MID, self::POS_RIGHT],
            ];
        }

        return $out;
    }

    /** @param array<int, array<int, int>> $flags playerId -> location -> flag index 0..7 */
    public static function initialFlags(array $playerIds): array
    {
        $out = [];
        foreach ($playerIds as $pid) {
            $out[$pid] = [0 => 0, 1 => 0, 2 => 0];
        }

        return $out;
    }

    /**
     * @param array<int, array<int, list<int>>> $scientists
     */
    public static function colorCountAtLocation(array $scientists, int $playerId, int $location, int $color): int
    {
        $n = 0;
        foreach ($scientists[$playerId][$color] as $pos) {
            if ($pos === $location) {
                $n++;
            }
        }

        return $n;
    }

    /**
     * @param array<int, array<int, list<int>>> $scientists
     */
    public static function hasAllColorsAtLocation(array $scientists, int $playerId, int $location): bool
    {
        for ($c = 0; $c < Material::SCIENTIST_COLORS; $c++) {
            if (self::colorCountAtLocation($scientists, $playerId, $location, $c) < 1) {
                return false;
            }
        }

        return true;
    }

    /**
     * @param array<int, array<int, list<int>>> $scientists
     * @param list<array{color:int, dir:string}> $moves
     *
     * @return array<int, array<int, list<int>>>
     */
    public static function applyObserveMoves(
        array $scientists,
        int $playerId,
        int $playLocation,
        array $moves,
    ): array {
        $s = $scientists;
        foreach ($moves as $m) {
            $color = (int) $m['color'];
            $dir = (string) $m['dir'];
            $idx = self::pickMeepleIndexAtLocation($s, $playerId, $color, $playLocation);
            if ($idx === null) {
                throw new UserException(clienttranslate('Invalid scientist movement'));
            }
            $s[$playerId][$color][$idx] = self::stepFrom($playLocation, $dir);
        }

        return $s;
    }

    /**
     * @param array<int, array<int, list<int>>> $scientists
     */
    private static function pickMeepleIndexAtLocation(
        array $scientists,
        int $playerId,
        int $color,
        int $location,
    ): ?int {
        foreach ($scientists[$playerId][$color] as $i => $pos) {
            if ($pos === $location) {
                return (int) $i;
            }
        }

        return null;
    }

    public static function stepFrom(int $from, string $dir): int
    {
        return match ($dir) {
            'shift_right' => match ($from) {
                self::POS_LEFT => self::POS_MID,
                self::POS_MID => self::POS_RIGHT,
                self::POS_RIGHT => self::POS_CAMP_R,
                default => $from,
            },
            'shift_left' => match ($from) {
                self::POS_RIGHT => self::POS_MID,
                self::POS_MID => self::POS_LEFT,
                self::POS_LEFT => self::POS_CAMP_L,
                default => $from,
            },
            default => $from,
        };
    }

    /**
     * @param array<int, array<int, list<int>>> $scientists
     *
     * @return array<int, array<int, list<int>>>
     */
    public static function moveAllCampScientistsToLocation(
        array $scientists,
        int $playerId,
        int $location,
    ): array {
        $s = $scientists;
        for ($c = 0; $c < Material::SCIENTIST_COLORS; $c++) {
            foreach ($s[$playerId][$c] as $i => $pos) {
                if ($pos === self::POS_CAMP_L || $pos === self::POS_CAMP_R) {
                    $s[$playerId][$c][$i] = $location;
                }
            }
        }

        return $s;
    }

    /**
     * @param array<int, array<int, list<int>>> $scientists
     */
    public static function countScientistsInCamps(array $scientists, int $playerId): int
    {
        $n = 0;
        for ($c = 0; $c < Material::SCIENTIST_COLORS; $c++) {
            foreach ($scientists[$playerId][$c] as $pos) {
                if ($pos === self::POS_CAMP_L || $pos === self::POS_CAMP_R) {
                    $n++;
                }
            }
        }

        return $n;
    }

    public static function boardLocationStr(int $playerId, int $loc): string
    {
        return 'board_' . $playerId . '_' . $loc;
    }

    /**
     * @return list<array{id:int, type:string, type_arg:int, location:string, location_arg:int}>
     */
    public static function cardsInLocationOrdered(Deck $deck, string $location, ?int $locationArg = null): array
    {
        return $deck->getCardsInLocation($location, $locationArg, 'card_location_arg');
    }

    public static function maxStackDepth(Deck $deck, int $playerId): int
    {
        $m = 0;
        for ($loc = 0; $loc < Material::LOCATION_COUNT; $loc++) {
            $locStr = self::boardLocationStr($playerId, $loc);
            $m = max($m, (int) $deck->countCardsInLocation($locStr));
        }

        return $m;
    }
}
