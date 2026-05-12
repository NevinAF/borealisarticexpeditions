<?php

declare(strict_types=1);

namespace Bga\Games\BorealisArticExpeditions;

/**
 * Static definitions for animals, tracks, objectives, and scoring cards.
 * Animal index 0..99 = 4 copies of each (species, vehicle) pair (25 pairs).
 */
final class Material
{
    public const SPECIES_COUNT = 5;

    public const VEHICLE_COUNT = 5;

    public const LOCATION_COUNT = 3;

    public const SCIENTIST_COLORS = 3;

    /** @var list<string> */
    public const SPECIES_NAMES = ['polar_bear', 'arctic_fox', 'snowy_owl', 'harp_seal', 'puffin'];

    /** @var list<string> */
    public const VEHICLE_NAMES = ['sleigh', 'zeppelin', 'submarine', 'kayak', 'skis'];

    /**
     * Victory points for N animals of the same species in one location (N = array index).
     * Index 0 unused; matches common Borealis-style curve (tunable against the physical board).
     *
     * @var list<int>
     */
    public const SPECIES_SET_VP = [0, 0, 1, 2, 4, 10, 15, 20];

    /**
     * Exploration track space values (index 0 = start; last is deepest).
     * One shared pattern for side A (all players use the same in this implementation).
     *
     * @var list<int>
     */
    public const TRACK_SPACE_VP = [0, 1, 1, 2, 2, 3, 4, 5];

    /**
     * Vehicles printed on each exploration space under the flag (side A).
     * Next space below flag is at index (flag + 1); match if card vehicle is in this list.
     *
     * @var list<list<int>> [location][spaceIndex] = list of vehicle ids
     */
    public const TRACK_SIDE_A_VEHICLES = [
        // Left location track
        [[0], [1], [2], [3], [4], [0, 1], [2, 3], [4]],
        // Middle
        [[1], [2], [3], [4], [0], [2, 3], [4, 0], [1]],
        // Right
        [[2], [3], [4], [0], [1], [3, 4], [0, 1], [2]],
    ];

    /** Scoring card ids (stable keys for logic + client). */
    public const SCORE_INTERSPECIES = 1;

    public const SCORE_SAFE_RETURN = 2;

    public const SCORE_COMMON_DESTINATION = 3;

    public const SCORE_MATING_SEASON = 4;

    public const SCORE_OUTER_LANDS = 5;

    /** Objective ids */
    public const OBJ_ANIMAL_SAMPLE = 101;

    public const OBJ_SCIENTIST_SAMPLE = 102;

    public const OBJ_VEHICLE_SAMPLE = 103;

    /**
     * @return array{species:int, vehicle:int, bonus_vp:int, moves:list<array{color:int, dir:string}>}
     */
    public static function getAnimalDefinition(int $index): array
    {
        $pair = intdiv($index, 4);
        $species = $pair % self::SPECIES_COUNT;
        $vehicle = intdiv($pair, self::SPECIES_COUNT) % self::VEHICLE_COUNT;
        $bonusVp = ($index % 3 === 0) ? 1 : 0;

        // Simple playable pattern: each color moves one step along the location line (L/M/R).
        $moves = [
            ['color' => 0, 'dir' => 'shift_right'],
            ['color' => 1, 'dir' => 'shift_left'],
            ['color' => 2, 'dir' => 'to_nearest_camp'],
        ];

        return [
            'species' => $species,
            'vehicle' => $vehicle,
            'bonus_vp' => $bonusVp,
            'moves' => $moves,
        ];
    }

    /**
     * @return list<int>
     */
    public static function allScoringCardIds(): array
    {
        return [
            self::SCORE_INTERSPECIES,
            self::SCORE_SAFE_RETURN,
            self::SCORE_COMMON_DESTINATION,
            self::SCORE_MATING_SEASON,
            self::SCORE_OUTER_LANDS,
        ];
    }

    /**
     * @return list<int>
     */
    public static function allObjectiveIds(): array
    {
        return [
            self::OBJ_ANIMAL_SAMPLE,
            self::OBJ_SCIENTIST_SAMPLE,
            self::OBJ_VEHICLE_SAMPLE,
        ];
    }

    public static function decodeAnimalCard(array $card): array
    {
        $idx = (int) ($card['type_arg'] ?? $card['card_type_arg'] ?? 0);

        return self::getAnimalDefinition($idx);
    }
}
