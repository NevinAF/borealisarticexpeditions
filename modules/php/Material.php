<?php

declare(strict_types=1);

namespace Bga\Games\BorealisArticExpeditions;

final class Material
{
    public const SPECIES_COUNT = 5;

    public const SPECIES_POLAR_BEAR = 0;
    public const SPECIES_ARCTIC_FOX = 1;
    public const SPECIES_SNOWY_OWL = 2;
    public const SPECIES_HARP_SEAL = 3;
    public const SPECIES_PUFFIN = 4;

    /**
     * @return list<string>
     */
    public static function getSpeciesNames(): array
    {
        return [
            clienttranslate('Polar Bear'),
            clienttranslate('Arctic Fox'),
            clienttranslate('Snowy Owl'),
            clienttranslate('Harp Seal'),
            clienttranslate('Puffin'),
        ];
    }


    public const VEHICLE_COUNT = 5;

    public const VEHICLE_SLEIGH = 0;
    public const VEHICLE_ZEPPELIN = 1;
    public const VEHICLE_SUBMARINE = 2;
    public const VEHICLE_KAYAK = 3;
    public const VEHICLE_SKIS = 4;

    /**
     * @return list<string>
     */
    public static function getVehicleNames(): array
    {
        return [
            clienttranslate('Sleigh'),
            clienttranslate('Zeppelin'),
            clienttranslate('Submarine'),
            clienttranslate('Kayak'),
            clienttranslate('Skis'),
        ];
    }


    public const LOCATION_COUNT = 3;

    public const LOCATION_LEFT = 0;
    public const LOCATION_MID = 1;
    public const LOCATION_RIGHT = 2;

    /**
     * @return list<string>
     */
    public static function getLocationNames(): array
    {
        return [
            clienttranslate('Left'),
            clienttranslate('Middle'),
            clienttranslate('Right'),
        ];
    }


    public const SCIENTIST_COLORS = 3;

    public const COLOR_YELLOW = 0;
    public const COLOR_PINK = 1;
    public const COLOR_BLUE = 2;

    /**
     * @return list<string>
     */
    public static function getScientistNames(): array
    {
        return [
            clienttranslate('Yellow Scientist'),
            clienttranslate('Pink Scientist'),
            clienttranslate('Blue Scientist'),
        ];
    }


    public const OBJECTIVE_TYPE_COUNT = 3;

    public const OBJECTIVE_TYPE_ANIMAL = 0;
    public const OBJECTIVE_TYPE_SCIENTIST = 1;
    public const OBJECTIVE_TYPE_VEHICLE = 2;

    /**
     * @return list<string>
     */
    public static function getObjectiveTypeNames(): array
    {
        return [
            clienttranslate('Animal Objective'),
            clienttranslate('Scientist Objective'),
            clienttranslate('Vehicle Objective'),
        ];
    }

    public const OBJECTIVE_COUNT = 12;

    public const OBJECTIVE_SPECIALISTS_RETREAT = 0;
    public const OBJECTIVE_COMPARING_NOTES = 1;
    public const OBJECTIVE_MORNING_SHIFT = 2;
    public const OBJECTIVE_SPLITTING_UP = 3;
    public const OBJECTIVE_BALANCED_ECOSYSTEM = 4;
    public const OBJECTIVE_RICHNESS_OF_NATURE = 5;
    public const OBJECTIVE_SPOTTING_LIST = 6;
    public const OBJECTIVE_FAVORITE_RESEARCH_OBJECT = 7;
    public const OBJECTIVE_ORGANIZED_EXPEDITION = 8;
    public const OBJECTIVE_CLIMBING_THE_AREA = 9;
    public const OBJECTIVE_BOLD_EXPLORERS = 10;
    public const OBJECTIVE_PROMISING_DIRECTION = 11;

    /**
     * @return array<int, array{title: string, description: string, type: int}>
     */
    public static function getObjectivesData(): array
    {
        return [
            self::OBJECTIVE_SPECIALISTS_RETREAT => [
                "title" => clienttranslate('Specialists\' Retreat'),
                "description" => clienttranslate('Have all 3 scientists of a chosen color in camps'),
                "type" => self::OBJECTIVE_TYPE_SCIENTIST,
            ],
            self::OBJECTIVE_COMPARING_NOTES => [
                "title" => clienttranslate('Comparing Notes'),
                "description" => clienttranslate('Have 3 scientists in a single camp'),
                "type" => self::OBJECTIVE_TYPE_SCIENTIST,
            ],
            self::OBJECTIVE_MORNING_SHIFT => [
                "title" => clienttranslate('Morning Shift'),
                "description" => clienttranslate('Return at least 5 scientists from the camps in a single turn'),
                "type" => self::OBJECTIVE_TYPE_SCIENTIST,
            ],
            self::OBJECTIVE_SPLITTING_UP => [
                "title" => clienttranslate('Splitting Up'),
                "description" => clienttranslate('Have max. 2 scientists in each location'),
                "type" => self::OBJECTIVE_TYPE_SCIENTIST,
            ],
            self::OBJECTIVE_BALANCED_ECOSYSTEM => [
                "title" => clienttranslate('Balanced Ecosystem'),
                "description" => clienttranslate('Have at least 3 animals in each location'),
                "type" => self::OBJECTIVE_TYPE_ANIMAL,
            ],
            self::OBJECTIVE_RICHNESS_OF_NATURE => [
                "title" => clienttranslate('Richness of Nature'),
                "description" => clienttranslate('Have 6 animal cards in a location'),
                "type" => self::OBJECTIVE_TYPE_ANIMAL,
            ],
            self::OBJECTIVE_SPOTTING_LIST => [
                "title" => clienttranslate('Spotting List'),
                "description" => clienttranslate('Have all 5 different species in play'),
                "type" => self::OBJECTIVE_TYPE_ANIMAL,
            ],
            self::OBJECTIVE_FAVORITE_RESEARCH_OBJECT => [
                "title" => clienttranslate('Favorite Research Object'),
                "description" => clienttranslate('Have 6 animals of the same species in play'),
                "type" => self::OBJECTIVE_TYPE_ANIMAL,
            ],
            self::OBJECTIVE_ORGANIZED_EXPEDITION => [
                "title" => clienttranslate('Organized Expedition'),
                "description" => clienttranslate('Have 4 identical vehicles in play'),
                "type" => self::OBJECTIVE_TYPE_VEHICLE,
            ],
            self::OBJECTIVE_CLIMBING_THE_AREA => [
                "title" => clienttranslate('Climbing the Area'),
                "description" => clienttranslate('Have all 3 flags 2 spaces from the start or further'),
                "type" => self::OBJECTIVE_TYPE_VEHICLE,
            ],
            self::OBJECTIVE_BOLD_EXPLORERS => [
                "title" => clienttranslate('Bold Explorers'),
                "description" => clienttranslate('Have a flag 5 spaces from the start'),
                "type" => self::OBJECTIVE_TYPE_VEHICLE,
            ],
            self::OBJECTIVE_PROMISING_DIRECTION => [
                "title" => clienttranslate('Promising Direction'),
                "description" => clienttranslate('Have a flag 4 spaces ahead of another'),
                "type" => self::OBJECTIVE_TYPE_VEHICLE,
            ],
        ];
    }

    public const PLAYER_BOARD_COUNT = 5; // A + 4 b sides

    public const PLAYER_BOARD_A = 0;
    public const PLAYER_BOARD_B = 1;

    /**
     * @return array<int, array{left_location: list<list<int>>, mid_location: list<list<int>>, right_location: list<list<int>>}>
     */
    public static function getPlayerBoardsData(): array
    {
        return [
        0 => [
            "left_location" => [
                [self::VEHICLE_ZEPPELIN, self::VEHICLE_SKIS],
                [self::VEHICLE_SLEIGH, self::VEHICLE_SUBMARINE],
                [self::VEHICLE_SKIS, self::VEHICLE_KAYAK],
                [self::VEHICLE_SLEIGH, self::VEHICLE_ZEPPELIN],
                [self::VEHICLE_SKIS, self::VEHICLE_SUBMARINE],
                [self::VEHICLE_KAYAK, self::VEHICLE_ZEPPELIN],
                [self::VEHICLE_SLEIGH, self::VEHICLE_SUBMARINE],
            ],
            "mid_location" => [
                [self::VEHICLE_ZEPPELIN, self::VEHICLE_SUBMARINE],
                [self::VEHICLE_SKIS, self::VEHICLE_KAYAK],
                [self::VEHICLE_SLEIGH, self::VEHICLE_ZEPPELIN],
                [self::VEHICLE_SUBMARINE, self::VEHICLE_KAYAK],
                [self::VEHICLE_SLEIGH, self::VEHICLE_SKIS],
                [self::VEHICLE_KAYAK, self::VEHICLE_ZEPPELIN],
                [self::VEHICLE_SLEIGH, self::VEHICLE_SKIS],
            ],
            "right_location" => [
                [self::VEHICLE_SLEIGH, self::VEHICLE_KAYAK],
                [self::VEHICLE_SKIS, self::VEHICLE_SUBMARINE],
                [self::VEHICLE_SLEIGH, self::VEHICLE_ZEPPELIN],
                [self::VEHICLE_SUBMARINE, self::VEHICLE_KAYAK],
                [self::VEHICLE_ZEPPELIN, self::VEHICLE_SKIS],
                [self::VEHICLE_KAYAK, self::VEHICLE_SLEIGH],
                [self::VEHICLE_ZEPPELIN, self::VEHICLE_SUBMARINE],
            ],
        ],
        1 => [
            "left_location" => [
                [self::VEHICLE_KAYAK, self::VEHICLE_SLEIGH],
                [self::VEHICLE_SKIS, self::VEHICLE_SUBMARINE],
                [self::VEHICLE_SLEIGH, self::VEHICLE_ZEPPELIN],
                [self::VEHICLE_KAYAK, self::VEHICLE_SKIS],
                [self::VEHICLE_ZEPPELIN, self::VEHICLE_SUBMARINE],
                [self::VEHICLE_SKIS, self::VEHICLE_SLEIGH],
                [self::VEHICLE_KAYAK, self::VEHICLE_ZEPPELIN],
            ],
            "mid_location" => [
                [self::VEHICLE_SUBMARINE, self::VEHICLE_ZEPPELIN],
                [self::VEHICLE_SKIS, self::VEHICLE_SLEIGH],
                [self::VEHICLE_KAYAK, self::VEHICLE_SUBMARINE],
                [self::VEHICLE_ZEPPELIN, self::VEHICLE_SKIS],
                [self::VEHICLE_SLEIGH, self::VEHICLE_KAYAK],
                [self::VEHICLE_SKIS, self::VEHICLE_SUBMARINE],
                [self::VEHICLE_SLEIGH, self::VEHICLE_ZEPPELIN],
            ],
            "right_location" => [
                [self::VEHICLE_SKIS, self::VEHICLE_KAYAK],
                [self::VEHICLE_ZEPPELIN, self::VEHICLE_SLEIGH],
                [self::VEHICLE_KAYAK, self::VEHICLE_SUBMARINE],
                [self::VEHICLE_ZEPPELIN, self::VEHICLE_SKIS],
                [self::VEHICLE_SUBMARINE, self::VEHICLE_SLEIGH],
                [self::VEHICLE_KAYAK, self::VEHICLE_ZEPPELIN],
                [self::VEHICLE_SLEIGH, self::VEHICLE_SUBMARINE],
            ],
        ],
        2 => [
            "left_location" => [
                [self::VEHICLE_KAYAK, self::VEHICLE_SUBMARINE],
                [self::VEHICLE_SLEIGH, self::VEHICLE_ZEPPELIN],
                [self::VEHICLE_SKIS, self::VEHICLE_KAYAK],
                [self::VEHICLE_ZEPPELIN, self::VEHICLE_SUBMARINE],
                [self::VEHICLE_KAYAK, self::VEHICLE_SLEIGH],
                [self::VEHICLE_SKIS, self::VEHICLE_ZEPPELIN],
                [self::VEHICLE_SLEIGH, self::VEHICLE_SUBMARINE],
            ],
            "mid_location" => [
                [self::VEHICLE_SLEIGH, self::VEHICLE_SUBMARINE],
                [self::VEHICLE_KAYAK, self::VEHICLE_ZEPPELIN],
                [self::VEHICLE_SUBMARINE, self::VEHICLE_SKIS],
                [self::VEHICLE_SLEIGH, self::VEHICLE_ZEPPELIN],
                [self::VEHICLE_SKIS, self::VEHICLE_KAYAK],
                [self::VEHICLE_ZEPPELIN, self::VEHICLE_SUBMARINE],
                [self::VEHICLE_SKIS, self::VEHICLE_SLEIGH],
            ],
            "right_location" => [
                [self::VEHICLE_SKIS, self::VEHICLE_ZEPPELIN],
                [self::VEHICLE_KAYAK, self::VEHICLE_SLEIGH],
                [self::VEHICLE_SUBMARINE, self::VEHICLE_SKIS],
                [self::VEHICLE_ZEPPELIN, self::VEHICLE_KAYAK],
                [self::VEHICLE_SKIS, self::VEHICLE_SLEIGH],
                [self::VEHICLE_KAYAK, self::VEHICLE_SUBMARINE],
                [self::VEHICLE_SLEIGH, self::VEHICLE_ZEPPELIN],
            ],
        ],
        3 => [
            "left_location" => [
                [self::VEHICLE_SKIS, self::VEHICLE_SLEIGH],
                [self::VEHICLE_ZEPPELIN, self::VEHICLE_SUBMARINE],
                [self::VEHICLE_SLEIGH, self::VEHICLE_KAYAK],
                [self::VEHICLE_SKIS, self::VEHICLE_ZEPPELIN],
                [self::VEHICLE_SUBMARINE, self::VEHICLE_SLEIGH],
                [self::VEHICLE_KAYAK, self::VEHICLE_ZEPPELIN],
                [self::VEHICLE_SUBMARINE, self::VEHICLE_SKIS],
            ],
            "mid_location" => [
                [self::VEHICLE_SKIS, self::VEHICLE_ZEPPELIN],
                [self::VEHICLE_SLEIGH, self::VEHICLE_SUBMARINE],
                [self::VEHICLE_ZEPPELIN, self::VEHICLE_KAYAK],
                [self::VEHICLE_SKIS, self::VEHICLE_SLEIGH],
                [self::VEHICLE_KAYAK, self::VEHICLE_SUBMARINE],
                [self::VEHICLE_SLEIGH, self::VEHICLE_ZEPPELIN],
                [self::VEHICLE_SKIS, self::VEHICLE_KAYAK],
            ],
            "right_location" => [
                [self::VEHICLE_KAYAK, self::VEHICLE_SUBMARINE],
                [self::VEHICLE_SLEIGH, self::VEHICLE_ZEPPELIN],
                [self::VEHICLE_SUBMARINE, self::VEHICLE_SKIS],
                [self::VEHICLE_KAYAK, self::VEHICLE_SLEIGH],
                [self::VEHICLE_ZEPPELIN, self::VEHICLE_SUBMARINE],
                [self::VEHICLE_SKIS, self::VEHICLE_KAYAK],
                [self::VEHICLE_SLEIGH, self::VEHICLE_ZEPPELIN],
            ],
        ],
        4 => [
            "left_location" => [
                [self::VEHICLE_SKIS, self::VEHICLE_KAYAK],
                [self::VEHICLE_SLEIGH, self::VEHICLE_ZEPPELIN],
                [self::VEHICLE_SKIS, self::VEHICLE_SUBMARINE],
                [self::VEHICLE_KAYAK, self::VEHICLE_SLEIGH],
                [self::VEHICLE_ZEPPELIN, self::VEHICLE_SUBMARINE],
                [self::VEHICLE_SLEIGH, self::VEHICLE_SKIS],
                [self::VEHICLE_KAYAK, self::VEHICLE_ZEPPELIN],
            ],
            "mid_location" => [
                [self::VEHICLE_SLEIGH, self::VEHICLE_ZEPPELIN],
                [self::VEHICLE_SKIS, self::VEHICLE_KAYAK],
                [self::VEHICLE_ZEPPELIN, self::VEHICLE_SUBMARINE],
                [self::VEHICLE_SLEIGH, self::VEHICLE_SKIS],
                [self::VEHICLE_SUBMARINE, self::VEHICLE_KAYAK],
                [self::VEHICLE_ZEPPELIN, self::VEHICLE_SKIS],
                [self::VEHICLE_SLEIGH, self::VEHICLE_SUBMARINE],
            ],
            "right_location" => [
                [self::VEHICLE_SLEIGH, self::VEHICLE_SUBMARINE],
                [self::VEHICLE_KAYAK, self::VEHICLE_ZEPPELIN],
                [self::VEHICLE_SKIS, self::VEHICLE_SUBMARINE],
                [self::VEHICLE_SLEIGH, self::VEHICLE_KAYAK],
                [self::VEHICLE_ZEPPELIN, self::VEHICLE_SKIS],
                [self::VEHICLE_SUBMARINE, self::VEHICLE_KAYAK],
                [self::VEHICLE_SLEIGH, self::VEHICLE_ZEPPELIN],
            ],
        ]
    ];
    }

    public const SCORING_CARD_COUNT = 10;

    public const SCORE_COMMON_DESTINATION = 0;
    public const SCORE_EXPANSIVE_SPECIES = 1;
    public const SCORE_FAREWELL_PARTY = 2;
    public const SCORE_INTERSPECIES = 3;
    public const SCORE_MATING_SEASON = 4;
    public const SCORE_OUTER_LANDS = 5;
    public const SCORE_POPULAR_VEHICLE = 6;
    public const SCORE_SAFE_RETURN = 7;
    public const SCORE_UNTRODDEN_PATH = 8;
    public const SCORE_TERRITORIAL_ANIMALS = 9;

    /**
     * @return array<int, array{title: string, description: string, explaination: string}>
     */
    public static function getScoringCardsData(): array
    {
        return [
        self::SCORE_INTERSPECIES => [
            "title" => clienttranslate('Interspecies Relationships'),
            "description" => clienttranslate('3 VP for each location with animals of exactly 2 species.'),
            "explaination" => clienttranslate('If a location contains animals of exactly 2 different species, score 3 VP for that location. Example: if only your middle location has exactly 2 species while the other two have 1 or 3+ species, you score 3 VP total.'),
        ],
        self::SCORE_SAFE_RETURN => [
            "title" => clienttranslate('Safe Return'),
            "description" => clienttranslate('3 VP for each scientist in a camp at the end of the game.'),
            "explaination" => clienttranslate('Count all scientists in both camps at the end of the game and score 3 VP for each. Example: 2 scientists in the left camp and 3 in the right camp score 15 VP.'),
        ],
        self::SCORE_COMMON_DESTINATION => [
            "title" => clienttranslate('Common Destination'),
            "description" => clienttranslate('12 VP if all 3 flags are in a horizontal line, or 5 VP if 2 flags are in a horizontal line.'),
            "explaination" => clienttranslate('Flags are in a horizontal line when they are the same distance from the start on their tracks. Example: if your left and right flags are 3 spaces from the start and your middle flag is 4 spaces from the start, 2 flags are aligned, so you score 5 VP.'),
        ],
        self::SCORE_MATING_SEASON => [
            "title" => clienttranslate('Mating Season'),
            "description" => clienttranslate('2 VP for each set of exactly 2 adjacent animals of the same species in a location.'),
            "explaination" => clienttranslate('Score each pair of adjacent cards of the same species in the same location only when the pair is exactly 2 cards; extra touching cards of that species do not count as that pair. Example: a sequence with two separate matching pairs in one location scores 4 VP there.'),
        ],
        self::SCORE_OUTER_LANDS => [
            "title" => clienttranslate('Outer Lands'),
            "description" => clienttranslate('7 VP for each outer location with more animal cards than the middle location.'),
            "explaination" => clienttranslate('Compare the left and right locations separately against the middle location. Example: if you have 5 cards left, 5 middle, and 6 right, only the right location scores, for 7 VP total.'),
        ],
        self::SCORE_EXPANSIVE_SPECIES => [
            "title" => clienttranslate('Expansive Species'),
            "description" => clienttranslate('5 VP for each horizontal row of 3 animals of the same species.'),
            "explaination" => clienttranslate('A horizontal row is formed by 3 cards of the same species at the same depth across your left, middle, and right locations. Example: if the bottom card in all 3 locations is the same species and the third card in all 3 locations is also the same species, you score 10 VP.'),
        ],
        self::SCORE_FAREWELL_PARTY => [
            "title" => clienttranslate('Farewell Party'),
            "description" => clienttranslate('2 VP for each scientist in 1 location of your choice at the end of the game.'),
            "explaination" => clienttranslate('At the end of the game, choose 1 location, not a camp, and score 2 VP for each of your scientists there. Example: if your chosen location has 4 scientists, you score 8 VP.'),
        ],
        self::SCORE_POPULAR_VEHICLE => [
            "title" => clienttranslate('Popular Vehicle'),
            "description" => clienttranslate('2 VP for each card with your most common vehicle type.'),
            "explaination" => clienttranslate('Determine which vehicle type appears most often among your cards in play and score 2 VP for each card of that type. If there is a tie for most common vehicle, choose only 1 tied vehicle type for scoring. Example: if skis appears on 4 of your cards, you score 8 VP.'),
        ],
        self::SCORE_TERRITORIAL_ANIMALS => [
            "title" => clienttranslate('Territorial Animals'),
            "description" => clienttranslate('6 VP for each location with no adjacent animals of the same species.'),
            "explaination" => clienttranslate('Check each location independently. A location scores only if no 2 vertically adjacent cards in that location show the same species. Horizontal matches between different locations do not matter. Example: if your left and right locations have no matching adjacent species but your middle location does, you score 12 VP.'),
        ],
        self::SCORE_UNTRODDEN_PATH => [
            "title" => clienttranslate('Untrodden Path'),
            "description" => clienttranslate('2 times the VP value of your least-scoring flag.'),
            "explaination" => clienttranslate('Look at the VP values of the 3 track spaces your flags occupy, find the lowest one, and double it. If 2 or more flags tie for the lowest value, use that value only once. Example: if your flags are on spaces worth 3, 4, and 5 VP, you score 6 VP.'),
        ],
    ];
    }

    /**
     * Victory points for N animals of the same species in one location (N = array index).
     * @var list<int>
     */
    public const SPECIES_SET_VP = [0, 0, 1, 3, 6, 10, 15, 21];

    /**
     * Exploration track space values (index 0 = start; last is deepest).
     * @var list<int>
     */
    public const TRACK_SPACE_VP = [
        [0, 1, 2, 3, 5, 8, 11, 15],
        [0, 1, 2, 3, 4, 6, 8, 11],
        [0, 1, 2, 3, 5, 8, 11, 15],
    ];

    /** @var list<array{species: int, vehicle: int, bonus_vp: int, left_move: int, right_move: int}> */
    public const ANIMAL_CARDS_DEFINITION = [
        0 => [
            "species" => self::SPECIES_SNOWY_OWL,
            "vehicle" => self::VEHICLE_SLEIGH,
            "bonus_vp" => 1,
            "left_move" => self::COLOR_YELLOW,
            "right_move" => self::COLOR_YELLOW,
        ],
        1 => [
            "species" => self::SPECIES_SNOWY_OWL,
            "vehicle" => self::VEHICLE_SUBMARINE,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_YELLOW,
            "right_move" => self::COLOR_PINK,
        ],
        2 => [
            "species" => self::SPECIES_SNOWY_OWL,
            "vehicle" =>  self::VEHICLE_SKIS,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_YELLOW,
            "right_move" => self::COLOR_BLUE,
        ],
        3 => [
            "species" => self::SPECIES_SNOWY_OWL,
            "vehicle" => self::VEHICLE_ZEPPELIN,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_PINK,
            "right_move" => self::COLOR_YELLOW,
        ],
        4 => [
            "species" => self::SPECIES_SNOWY_OWL,
            "vehicle" => self::VEHICLE_KAYAK,
            "bonus_vp" => 1,
            "left_move" => self::COLOR_PINK,
            "right_move" => self::COLOR_PINK,
        ],
        5 => [
            "species" => self::SPECIES_SNOWY_OWL,
            "vehicle" =>  self::VEHICLE_SLEIGH,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_YELLOW,
            "right_move" => self::COLOR_PINK,
        ],
        6 => [
            "species" => self::SPECIES_SNOWY_OWL,
            "vehicle" => self::VEHICLE_SUBMARINE,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_PINK,
            "right_move" => self::COLOR_BLUE,
        ],
        7 => [
            "species" => self::SPECIES_SNOWY_OWL,
            "vehicle" => self::VEHICLE_SKIS,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_PINK,
            "right_move" => self::COLOR_YELLOW,
        ],
        8 => [
            "species" => self::SPECIES_SNOWY_OWL,
            "vehicle" => self::VEHICLE_ZEPPELIN,
            "bonus_vp" => 1,
            "left_move" => self::COLOR_BLUE,
            "right_move" => self::COLOR_BLUE,
        ],
        9 => [
            "species" => self::SPECIES_SNOWY_OWL,
            "vehicle" => self::VEHICLE_KAYAK,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_BLUE,
            "right_move" => self::COLOR_YELLOW,
        ],
        10 => [
            "species" => self::SPECIES_SNOWY_OWL,
            "vehicle" => self::VEHICLE_SLEIGH,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_BLUE,
            "right_move" => self::COLOR_PINK,
        ],
        11 => [
            "species" => self::SPECIES_SNOWY_OWL,
            "vehicle" => self::VEHICLE_SUBMARINE,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_BLUE,
            "right_move" => self::COLOR_YELLOW,
        ],
        12 => [
            "species" => self::SPECIES_SNOWY_OWL,
            "vehicle" => self::VEHICLE_SKIS,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_BLUE,
            "right_move" => self::COLOR_PINK,
        ],
        13 => [
            "species" => self::SPECIES_SNOWY_OWL,
            "vehicle" => self::VEHICLE_ZEPPELIN,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_BLUE,
            "right_move" => self::COLOR_PINK,
        ],
        14 => [
            "species" => self::SPECIES_SNOWY_OWL,
            "vehicle" => self::VEHICLE_KAYAK,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_PINK,
            "right_move" => self::COLOR_YELLOW,
        ],
        15 => [
            "species" => self::SPECIES_SNOWY_OWL,
            "vehicle" => self::VEHICLE_SLEIGH,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_YELLOW,
            "right_move" => self::COLOR_BLUE,
        ],
        16 => [
            "species" => self::SPECIES_SNOWY_OWL,
            "vehicle" => self::VEHICLE_SUBMARINE,
            "bonus_vp" => 1,
            "left_move" => self::COLOR_PINK,
            "right_move" => self::COLOR_PINK,
        ],
        17 => [
            "species" => self::SPECIES_SNOWY_OWL,
            "vehicle" => self::VEHICLE_SKIS,
            "bonus_vp" => 1,
            "left_move" => self::COLOR_BLUE,
            "right_move" => self::COLOR_BLUE,
        ],
        18 => [
            "species" => self::SPECIES_HARP_SEAL,
            "vehicle" => self::VEHICLE_SUBMARINE,
            "bonus_vp" => 1,
            "left_move" => self::COLOR_PINK,
            "right_move" => self::COLOR_PINK,
        ],
        19 => [
            "species" => self::SPECIES_HARP_SEAL,
            "vehicle" => self::VEHICLE_SKIS,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_PINK,
            "right_move" => self::COLOR_BLUE,
        ],
        20 => [
            "species" => self::SPECIES_HARP_SEAL,
            "vehicle" => self::VEHICLE_ZEPPELIN,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_BLUE,
            "right_move" => self::COLOR_PINK,
        ],
        21 => [
            "species" => self::SPECIES_HARP_SEAL,
            "vehicle" => self::VEHICLE_KAYAK,
            "bonus_vp" => 1,
            "left_move" => self::COLOR_BLUE,
            "right_move" => self::COLOR_BLUE,
        ],
        22 => [
            "species" => self::SPECIES_HARP_SEAL,
            "vehicle" => self::VEHICLE_SLEIGH,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_BLUE,
            "right_move" => self::COLOR_PINK,
        ],
        23 => [
            "species" => self::SPECIES_HARP_SEAL,
            "vehicle" => self::VEHICLE_SUBMARINE,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_PINK,
            "right_move" => self::COLOR_BLUE,
        ],
        24 => [
            "species" => self::SPECIES_HARP_SEAL,
            "vehicle" => self::VEHICLE_SKIS,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_BLUE,
            "right_move" => self::COLOR_YELLOW,
        ],
        25 => [
            "species" => self::SPECIES_HARP_SEAL,
            "vehicle" => self::VEHICLE_ZEPPELIN,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_BLUE,
            "right_move" => self::COLOR_YELLOW,
        ],
        26 => [
            "species" => self::SPECIES_HARP_SEAL,
            "vehicle" => self::VEHICLE_KAYAK,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_PINK,
            "right_move" => self::COLOR_BLUE,
        ],
        27 => [
            "species" => self::SPECIES_HARP_SEAL,
            "vehicle" => self::VEHICLE_SLEIGH,
            "bonus_vp" => 1,
            "left_move" => self::COLOR_YELLOW,
            "right_move" => self::COLOR_YELLOW,
        ],
        28 => [
            "species" => self::SPECIES_HARP_SEAL,
            "vehicle" => self::VEHICLE_SUBMARINE,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_YELLOW,
            "right_move" => self::COLOR_PINK,
        ],
        29 => [
            "species" => self::SPECIES_HARP_SEAL,
            "vehicle" => self::VEHICLE_SKIS,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_PINK,
            "right_move" => self::COLOR_BLUE,
        ],
        30 => [
            "species" => self::SPECIES_PUFFIN,
            "vehicle" => self::VEHICLE_ZEPPELIN,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_YELLOW,
            "right_move" => self::COLOR_BLUE,
        ],
        31 => [
            "species" => self::SPECIES_PUFFIN,
            "vehicle" => self::VEHICLE_KAYAK,
            "bonus_vp" => 1,
            "left_move" => self::COLOR_YELLOW,
            "right_move" => self::COLOR_YELLOW,
        ],
        32 => [
            "species" => self::SPECIES_PUFFIN,
            "vehicle" => self::VEHICLE_SLEIGH,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_YELLOW,
            "right_move" => self::COLOR_PINK,
        ],
        33 => [
            "species" => self::SPECIES_PUFFIN,
            "vehicle" => self::VEHICLE_SUBMARINE,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_YELLOW,
            "right_move" => self::COLOR_PINK,
        ],
        34 => [
            "species" => self::SPECIES_PUFFIN,
            "vehicle" => self::VEHICLE_SKIS,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_YELLOW,
            "right_move" => self::COLOR_BLUE,
        ],
        35 => [
            "species" => self::SPECIES_PUFFIN,
            "vehicle" => self::VEHICLE_ZEPPELIN,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_PINK,
            "right_move" => self::COLOR_YELLOW,
        ],
        36 => [
            "species" => self::SPECIES_PUFFIN,
            "vehicle" => self::VEHICLE_KAYAK,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_BLUE,
            "right_move" => self::COLOR_YELLOW,
        ],
        37 => [
            "species" => self::SPECIES_PUFFIN,
            "vehicle" => self::VEHICLE_SLEIGH,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_PINK,
            "right_move" => self::COLOR_BLUE,
        ],
        38 => [
            "species" => self::SPECIES_PUFFIN,
            "vehicle" => self::VEHICLE_SUBMARINE,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_BLUE,
            "right_move" => self::COLOR_YELLOW,
        ],
        39 => [
            "species" => self::SPECIES_PUFFIN,
            "vehicle" => self::VEHICLE_SKIS,
            "bonus_vp" => 1,
            "left_move" => self::COLOR_PINK,
            "right_move" => self::COLOR_PINK,
        ],
        40 => [
            "species" => self::SPECIES_PUFFIN,
            "vehicle" => self::VEHICLE_ZEPPELIN,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_PINK,
            "right_move" => self::COLOR_BLUE,
        ],
        41 => [
            "species" => self::SPECIES_PUFFIN,
            "vehicle" => self::VEHICLE_KAYAK,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_BLUE,
            "right_move" => self::COLOR_PINK,
        ],
        42 => [
            "species" => self::SPECIES_PUFFIN,
            "vehicle" => self::VEHICLE_SLEIGH,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_BLUE,
            "right_move" => self::COLOR_YELLOW,
        ],
        43 => [
            "species" => self::SPECIES_PUFFIN,
            "vehicle" => self::VEHICLE_SUBMARINE,
            "bonus_vp" => 1,
            "left_move" => self::COLOR_BLUE,
            "right_move" => self::COLOR_BLUE,
        ],
        44 => [
            "species" => self::SPECIES_PUFFIN,
            "vehicle" => self::VEHICLE_SKIS,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_PINK,
            "right_move" => self::COLOR_BLUE,
        ],
        45 => [
            "species" => self::SPECIES_PUFFIN,
            "vehicle" => self::VEHICLE_ZEPPELIN,
            "bonus_vp" => 1,
            "left_move" => self::COLOR_YELLOW,
            "right_move" => self::COLOR_YELLOW,
        ],
        46 => [
            "species" => self::SPECIES_PUFFIN,
            "vehicle" => self::VEHICLE_KAYAK,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_YELLOW,
            "right_move" => self::COLOR_PINK,
        ],
        47 => [
            "species" => self::SPECIES_PUFFIN,
            "vehicle" => self::VEHICLE_SLEIGH,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_BLUE,
            "right_move" => self::COLOR_PINK,
        ],
        48 => [
            "species" => self::SPECIES_PUFFIN,
            "vehicle" => self::VEHICLE_SUBMARINE,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_PINK,
            "right_move" => self::COLOR_BLUE,
        ],
        49 => [
            "species" => self::SPECIES_PUFFIN,
            "vehicle" => self::VEHICLE_SKIS,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_PINK,
            "right_move" => self::COLOR_YELLOW,
        ],
        50 => [
            "species" => self::SPECIES_ARCTIC_FOX,
            "vehicle" => self::VEHICLE_ZEPPELIN,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_YELLOW,
            "right_move" => self::COLOR_BLUE,
        ],
        51 => [
            "species" => self::SPECIES_ARCTIC_FOX,
            "vehicle" => self::VEHICLE_KAYAK,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_YELLOW,
            "right_move" => self::COLOR_PINK,
        ],
        52 => [
            "species" => self::SPECIES_ARCTIC_FOX,
            "vehicle" => self::VEHICLE_SLEIGH,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_YELLOW,
            "right_move" => self::COLOR_PINK,
        ],
        53 => [
            "species" => self::SPECIES_ARCTIC_FOX,
            "vehicle" => self::VEHICLE_SUBMARINE,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_YELLOW,
            "right_move" => self::COLOR_BLUE,
        ],
        54 => [
            "species" => self::SPECIES_ARCTIC_FOX,
            "vehicle" => self::VEHICLE_SKIS,
            "bonus_vp" => 1,
            "left_move" => self::COLOR_YELLOW,
            "right_move" => self::COLOR_YELLOW,
        ],
        55 => [
            "species" => self::SPECIES_ARCTIC_FOX,
            "vehicle" => self::VEHICLE_ZEPPELIN,
            "bonus_vp" => 1,
            "left_move" => self::COLOR_PINK,
            "right_move" => self::COLOR_PINK,
        ],
        56 => [
            "species" => self::SPECIES_ARCTIC_FOX,
            "vehicle" => self::VEHICLE_KAYAK,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_PINK,
            "right_move" => self::COLOR_BLUE,
        ],
        57 => [
            "species" => self::SPECIES_ARCTIC_FOX,
            "vehicle" => self::VEHICLE_SLEIGH,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_BLUE,
            "right_move" => self::COLOR_YELLOW,
        ],
        58 => [
            "species" => self::SPECIES_ARCTIC_FOX,
            "vehicle" => self::VEHICLE_SUBMARINE,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_PINK,
            "right_move" => self::COLOR_YELLOW,
        ],
        59 => [
            "species" => self::SPECIES_ARCTIC_FOX,
            "vehicle" => self::VEHICLE_SKIS,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_PINK,
            "right_move" => self::COLOR_BLUE,
        ],
        60 => [
            "species" => self::SPECIES_ARCTIC_FOX,
            "vehicle" => self::VEHICLE_ZEPPELIN,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_PINK,
            "right_move" => self::COLOR_YELLOW,
        ],
        61 => [
            "species" => self::SPECIES_ARCTIC_FOX,
            "vehicle" => self::VEHICLE_KAYAK,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_BLUE,
            "right_move" => self::COLOR_YELLOW,
        ],
        62 => [
            "species" => self::SPECIES_ARCTIC_FOX,
            "vehicle" => self::VEHICLE_SLEIGH,
            "bonus_vp" => 1,
            "left_move" => self::COLOR_BLUE,
            "right_move" => self::COLOR_BLUE,
        ],
        63 => [
            "species" => self::SPECIES_ARCTIC_FOX,
            "vehicle" => self::VEHICLE_SUBMARINE,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_BLUE,
            "right_move" => self::COLOR_PINK,
        ],
        64 => [
            "species" => self::SPECIES_ARCTIC_FOX,
            "vehicle" => self::VEHICLE_SKIS,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_YELLOW,
            "right_move" => self::COLOR_PINK,
        ],
        65 => [
            "species" => self::SPECIES_ARCTIC_FOX,
            "vehicle" => self::VEHICLE_ZEPPELIN,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_PINK,
            "right_move" => self::COLOR_BLUE,
        ],
        66 => [
            "species" => self::SPECIES_ARCTIC_FOX,
            "vehicle" => self::VEHICLE_KAYAK,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_YELLOW,
            "right_move" => self::COLOR_BLUE,
        ],
        67 => [
            "species" => self::SPECIES_ARCTIC_FOX,
            "vehicle" => self::VEHICLE_SLEIGH,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_BLUE,
            "right_move" => self::COLOR_PINK,
        ],
        68 => [
            "species" => self::SPECIES_ARCTIC_FOX,
            "vehicle" => self::VEHICLE_SUBMARINE,
            "bonus_vp" => 1,
            "left_move" => self::COLOR_PINK,
            "right_move" => self::COLOR_PINK,
        ],
        69 => [
            "species" => self::SPECIES_ARCTIC_FOX,
            "vehicle" => self::VEHICLE_SKIS,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_BLUE,
            "right_move" => self::COLOR_YELLOW,
        ],
        70 => [
            "species" => self::SPECIES_SNOWY_OWL,
            "vehicle" => self::VEHICLE_ZEPPELIN,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_YELLOW,
            "right_move" => self::COLOR_BLUE,
        ],
        71 => [
            "species" => self::SPECIES_SNOWY_OWL,
            "vehicle" => self::VEHICLE_KAYAK,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_PINK,
            "right_move" => self::COLOR_BLUE,
        ],
        72 => [
            "species" => self::SPECIES_POLAR_BEAR,
            "vehicle" => self::VEHICLE_ZEPPELIN,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_YELLOW,
            "right_move" => self::COLOR_PINK,
        ],
        73 => [
            "species" => self::SPECIES_POLAR_BEAR,
            "vehicle" => self::VEHICLE_KAYAK,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_YELLOW,
            "right_move" => self::COLOR_BLUE,
        ],
        74 => [
            "species" => self::SPECIES_POLAR_BEAR,
            "vehicle" => self::VEHICLE_SLEIGH,
            "bonus_vp" => 1,
            "left_move" => self::COLOR_BLUE,
            "right_move" => self::COLOR_BLUE,
        ],
        75 => [
            "species" => self::SPECIES_POLAR_BEAR,
            "vehicle" => self::VEHICLE_SUBMARINE,
            "bonus_vp" => 1,
            "left_move" => self::COLOR_YELLOW,
            "right_move" => self::COLOR_YELLOW,
        ],
        76 => [
            "species" => self::SPECIES_POLAR_BEAR,
            "vehicle" => self::VEHICLE_SKIS,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_PINK,
            "right_move" => self::COLOR_BLUE,
        ],
        77 => [
            "species" => self::SPECIES_POLAR_BEAR,
            "vehicle" => self::VEHICLE_ZEPPELIN,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_PINK,
            "right_move" => self::COLOR_YELLOW,
        ],
        78 => [
            "species" => self::SPECIES_POLAR_BEAR,
            "vehicle" => self::VEHICLE_KAYAK,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_PINK,
            "right_move" => self::COLOR_YELLOW,
        ],
        79 => [
            "species" => self::SPECIES_POLAR_BEAR,
            "vehicle" => self::VEHICLE_SLEIGH,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_PINK,
            "right_move" => self::COLOR_BLUE,
        ],
        80 => [
            "species" => self::SPECIES_POLAR_BEAR,
            "vehicle" => self::VEHICLE_SUBMARINE,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_PINK,
            "right_move" => self::COLOR_YELLOW,
        ],
        81 => [
            "species" => self::SPECIES_POLAR_BEAR,
            "vehicle" => self::VEHICLE_SKIS,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_PINK,
            "right_move" => self::COLOR_YELLOW,
        ],
        82 => [
            "species" => self::SPECIES_POLAR_BEAR,
            "vehicle" => self::VEHICLE_ZEPPELIN,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_YELLOW,
            "right_move" => self::COLOR_BLUE,
        ],
        83 => [
            "species" => self::SPECIES_POLAR_BEAR,
            "vehicle" => self::VEHICLE_KAYAK,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_BLUE,
            "right_move" => self::COLOR_PINK,
        ],
        84 => [
            "species" => self::SPECIES_POLAR_BEAR,
            "vehicle" => self::VEHICLE_SLEIGH,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_BLUE,
            "right_move" => self::COLOR_YELLOW,
        ],
        85 => [
            "species" => self::SPECIES_POLAR_BEAR,
            "vehicle" => self::VEHICLE_SUBMARINE,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_BLUE,
            "right_move" => self::COLOR_PINK,
        ],
        86 => [
            "species" => self::SPECIES_POLAR_BEAR,
            "vehicle" => self::VEHICLE_SKIS,
            "bonus_vp" => 1,
            "left_move" => self::COLOR_BLUE,
            "right_move" => self::COLOR_BLUE,
        ],
        87 => [
            "species" => self::SPECIES_POLAR_BEAR,
            "vehicle" => self::VEHICLE_ZEPPELIN,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_BLUE,
            "right_move" => self::COLOR_PINK,
        ],
        88 => [
            "species" => self::SPECIES_POLAR_BEAR,
            "vehicle" => self::VEHICLE_KAYAK,
            "bonus_vp" => 1,
            "left_move" => self::COLOR_PINK,
            "right_move" => self::COLOR_PINK,
        ],
        89 => [
            "species" => self::SPECIES_POLAR_BEAR,
            "vehicle" => self::VEHICLE_SLEIGH,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_YELLOW,
            "right_move" => self::COLOR_PINK,
        ],
        90 => [
            "species" => self::SPECIES_POLAR_BEAR,
            "vehicle" => self::VEHICLE_SUBMARINE,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_BLUE,
            "right_move" => self::COLOR_YELLOW,
        ],
        91 => [
            "species" => self::SPECIES_POLAR_BEAR,
            "vehicle" => self::VEHICLE_SKIS,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_YELLOW,
            "right_move" => self::COLOR_BLUE,
        ],
        92 => [
            "species" => self::SPECIES_HARP_SEAL,
            "vehicle" => self::VEHICLE_ZEPPELIN,
            "bonus_vp" => 1,
            "left_move" => self::COLOR_YELLOW,
            "right_move" => self::COLOR_YELLOW,
        ],
        93 => [
            "species" => self::SPECIES_HARP_SEAL,
            "vehicle" => self::VEHICLE_KAYAK,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_YELLOW,
            "right_move" => self::COLOR_PINK,
        ],
        94 => [
            "species" => self::SPECIES_HARP_SEAL,
            "vehicle" => self::VEHICLE_SLEIGH,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_YELLOW,
            "right_move" => self::COLOR_BLUE,
        ],
        95 => [
            "species" => self::SPECIES_HARP_SEAL,
            "vehicle" => self::VEHICLE_SUBMARINE,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_YELLOW,
            "right_move" => self::COLOR_BLUE,
        ],
        96 => [
            "species" => self::SPECIES_HARP_SEAL,
            "vehicle" => self::VEHICLE_SKIS,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_YELLOW,
            "right_move" => self::COLOR_PINK,
        ],
        97 => [
            "species" => self::SPECIES_HARP_SEAL,
            "vehicle" => self::VEHICLE_ZEPPELIN,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_PINK,
            "right_move" => self::COLOR_YELLOW,
        ],
        98 => [
            "species" => self::SPECIES_HARP_SEAL,
            "vehicle" => self::VEHICLE_KAYAK,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_BLUE,
            "right_move" => self::COLOR_YELLOW,
        ],
        99 => [
            "species" => self::SPECIES_HARP_SEAL,
            "vehicle" => self::VEHICLE_SLEIGH,
            "bonus_vp" => 0,
            "left_move" => self::COLOR_PINK,
            "right_move" => self::COLOR_YELLOW,
        ]
    ];

    /**
     * Get all scoring card IDs (0-9)
     * @return list<int>
     */
    public static function allScoringCardIds(): array
    {
        return [
            self::SCORE_COMMON_DESTINATION,
            self::SCORE_EXPANSIVE_SPECIES,
            self::SCORE_FAREWELL_PARTY,
            self::SCORE_INTERSPECIES,
            self::SCORE_MATING_SEASON,
            self::SCORE_OUTER_LANDS,
            self::SCORE_POPULAR_VEHICLE,
            self::SCORE_SAFE_RETURN,
            self::SCORE_UNTRODDEN_PATH,
            self::SCORE_TERRITORIAL_ANIMALS,
        ];
    }

    /**
     * Get objectives grouped by type for random selection
     * @return array{animal: list<int>, scientist: list<int>, vehicle: list<int>>
     */
    public static function getObjectivesByType(): array
    {
        $objectives = self::getObjectivesData();
        $grouped = [
            'animal' => [],
            'scientist' => [],
            'vehicle' => [],
        ];
        
        foreach ($objectives as $id => $data) {
            $type = $data['type'];
            if ($type === self::OBJECTIVE_TYPE_ANIMAL) {
                $grouped['animal'][] = $id;
            } elseif ($type === self::OBJECTIVE_TYPE_SCIENTIST) {
                $grouped['scientist'][] = $id;
            } elseif ($type === self::OBJECTIVE_TYPE_VEHICLE) {
                $grouped['vehicle'][] = $id;
            }
        }
        
        return $grouped;
    }
}
