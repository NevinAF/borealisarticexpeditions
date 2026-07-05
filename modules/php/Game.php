<?php

declare(strict_types=1);

namespace Bga\Games\BorealisArticExpeditions;

use Bga\Games\BorealisArticExpeditions\States\Gameplay;
use Bga\Games\BorealisArticExpeditions\States\OpeningMulligan;

require_once __DIR__ . '/States/OpeningMulligan.php';

class Game extends \Bga\GameFramework\Table
{
    public const GLOBAL_SCIENTISTS = 'scientists';

    public const GLOBAL_FLAGS = 'flags';

    public const GLOBAL_OBJECTIVES = 'objectives';

    public const GLOBAL_SCORING_CARDS = 'scoring_cards';

    public const GLOBAL_ROUND_LEADER = 'round_leader_id';

    public const GLOBAL_MULLIGAN = 'mulligan_used';

    public const GLOBAL_DECK = 'deck';

    public const GLOBAL_DISCARD = 'discard';

    public const GLOBAL_POOL = 'pool';

    public const GLOBAL_HANDS = 'hands';

    public const GLOBAL_BOARDS = 'boards';

    public const GLOBAL_BOARD_FOR_PLAYERS = 'board_for_players';

    public const GLOBAL_LAST_RETURNED = 'last_returned_counts';

    public function __construct()
    {
        parent::__construct();
    }

    public function getGameProgression(): int
    {
        $max = 0;
        $boards = $this->getBoards();
        foreach ($this->getNextPlayerTable() as $pid => $_) {
            if ($pid === 0 || $pid === '0') {
                continue;
            }
            $pid = (int) $pid;
            for ($loc = 0; $loc < Material::LOCATION_COUNT; $loc++) {
                $max = max($max, count($boards[$pid][$loc] ?? []));
            }
        }
        if ($max >= 7) {
            return 99;
        }

        return min(95, 10 + $max * 12);
    }

    public function getAllDatas(int $currentPlayerId): array
    {
        $result = [];
        $result['players'] = $this->getCollectionFromDb(
            'SELECT `player_id` AS `id`, `player_score` AS `score` FROM `player`'
        );
        
        $result['boardState'] = $this->getBoardState($currentPlayerId);
        
        // Material definitions passed once at game start for client use
        $result['materials'] = [
            'animal_cards' => Material::ANIMAL_CARDS_DEFINITION,
            'objectives' => Material::getObjectivesData(),
            'scoring_cards' => Material::getScoringCardsData(),
            'player_boards' => Material::getPlayerBoardsData(),
            'species_names' => Material::getSpeciesNames(),
            'vehicle_names' => Material::getVehicleNames(),
            'location_names' => Material::getLocationNames(),
            'scientist_names' => Material::getScientistNames(),
            'objective_type_names' => Material::getObjectiveTypeNames(),
            'track_space_vp' => Material::TRACK_SPACE_VP,
        ];

        return $result;
    }

    public function getBoardState(int $currentPlayerId): array
    {
        $result = [];
        $result['scientists'] = $this->getScientists();
        $result['flags'] = $this->getFlags();
        $result['pool'] = $this->getPoolCards();
        $result['deck_count'] = count($this->getDeck());
        $result['discard_count'] = count($this->getDiscard());
        $result['boards'] = $this->getPublicBoards();
        $result['hands'] = [];
        foreach ($this->getNextPlayerTable() as $pid => $_) {
            if ($pid === 0) {
                continue;
            }
            $pid = (int) $pid;
            if ($pid === $currentPlayerId) {
                $result['hands'][$pid] = $this->getHandCardsFor($pid);
            } else {
                $result['hands'][$pid] = count($this->getHands()[$pid] ?? []);
            }
        }
        $result['objectives'] = $this->getObjectivesState();
        $result['scoring_cards'] = $this->getScoringCardIds();
        $result['board_for_players'] = $this->getBoardForPlayers();
        $vps = $this->getCollectionFromDb(
            'SELECT `player_id` AS `id`, `player_score` AS `score` FROM `player`'
        );
        $result['vps'] = $vps;
        $result['playersEndingGame'] = $this->playersWithLocationSevenPlusCards();

        return $result;
    }

    /**
     * @return array<int, array<int, list<int>>>
     */
    public function getScientists(): array
    {
        $v = $this->bga->globals->get(self::GLOBAL_SCIENTISTS, []);

        return is_array($v) ? $v : [];
    }

    /**
     * @param array<int, array<int, list<int>>> $data
     */
    public function setScientists(array $data): void
    {
        $this->bga->globals->set(self::GLOBAL_SCIENTISTS, $data);
    }

    /**
     * @return array<int, array<int, int>>
     */
    public function getFlags(): array
    {
        $v = $this->bga->globals->get(self::GLOBAL_FLAGS, []);

        return is_array($v) ? $v : [];
    }

    /**
     * @param array<int, array<int, int>> $data
     */
    public function setFlags(array $data): void
    {
        $this->bga->globals->set(self::GLOBAL_FLAGS, $data);
    }

    /**
     * @return array<int, int>
     */
    public function getLastReturnedCounts(): array
    {
        $v = $this->bga->globals->get(self::GLOBAL_LAST_RETURNED, []);

        return is_array($v) ? array_map('intval', $v) : [];
    }

    /**
     * @param array<int, int> $m
     */
    public function setLastReturnedCounts(array $m): void
    {
        $this->bga->globals->set(self::GLOBAL_LAST_RETURNED, $m);
    }

    /**
     * @return list<array{id:int, active:bool, players:array<int, string>}>
     */
    public function getObjectivesState(): array
    {
        $v = $this->bga->globals->get(self::GLOBAL_OBJECTIVES, []);

        return is_array($v) ? $v : [];
    }

    /**
     * @param list<array{id:int, active:bool, players:array<int, string>}> $o
     */
    public function setObjectivesState(array $o): void
    {
        $this->bga->globals->set(self::GLOBAL_OBJECTIVES, $o);
    }

    /**
     * @return list<int>
     */
    public function getScoringCardIds(): array
    {
        $v = $this->bga->globals->get(self::GLOBAL_SCORING_CARDS, []);

        return is_array($v) ? $v : [];
    }

    /**
     * @param list<int> $ids
     */
    public function setScoringCardIds(array $ids): void
    {
        $this->bga->globals->set(self::GLOBAL_SCORING_CARDS, $ids);
    }

    public function getRoundLeaderId(): int
    {
        return (int) $this->bga->globals->get(self::GLOBAL_ROUND_LEADER, 0);
    }

    public function setRoundLeaderId(int $id): void
    {
        $this->bga->globals->set(self::GLOBAL_ROUND_LEADER, $id);
    }

    /**
     * @return array<int, bool>
     */
    public function getMulliganUsed(): array
    {
        $v = $this->bga->globals->get(self::GLOBAL_MULLIGAN, []);

        return is_array($v) ? $v : [];
    }

    /**
     * @param array<int, bool> $m
     */
    public function setMulliganUsed(array $m): void
    {
        $this->bga->globals->set(self::GLOBAL_MULLIGAN, $m);
    }

    /**
     * @return list<int>
     */
    public function getDeck(): array
    {
        $v = $this->bga->globals->get(self::GLOBAL_DECK, []);

        return is_array($v) ? array_map('intval', $v) : [];
    }

    /**
     * @param list<int> $deck
     */
    public function setDeck(array $deck): void
    {
        $this->bga->globals->set(self::GLOBAL_DECK, $deck);
    }

    /**
     * @return list<int>
     */
    public function getDiscard(): array
    {
        $v = $this->bga->globals->get(self::GLOBAL_DISCARD, []);

        return is_array($v) ? array_map('intval', $v) : [];
    }

    /**
     * @param list<int> $discard
     */
    public function setDiscard(array $discard): void
    {
        $this->bga->globals->set(self::GLOBAL_DISCARD, $discard);
    }

    /**
     * @return array<int, int>
     */
    public function getPool(): array
    {
        $v = $this->bga->globals->get(self::GLOBAL_POOL, []);

        return is_array($v) ? array_map('intval', $v) : [];
    }

    /**
     * @param array<int, int> $pool
     */
    public function setPool(array $pool): void
    {
        $this->bga->globals->set(self::GLOBAL_POOL, $pool);
    }

    /**
     * @return array<int, list<int>>
     */
    public function getHands(): array
    {
        $v = $this->bga->globals->get(self::GLOBAL_HANDS, []);

        return is_array($v) ? $v : [];
    }

    /**
     * @param array<int, list<int>> $hands
     */
    public function setHands(array $hands): void
    {
        $this->bga->globals->set(self::GLOBAL_HANDS, $hands);
    }

    /**
     * @return array<int, list<list<int>>>
     */
    public function getBoards(): array
    {
        $v = $this->bga->globals->get(self::GLOBAL_BOARDS, []);

        return is_array($v) ? $v : [];
    }

    /**
     * @param array<int, list<list<int>>> $boards
     */
    public function setBoards(array $boards): void
    {
        $this->bga->globals->set(self::GLOBAL_BOARDS, $boards);
    }

    public function getBoardForPlayers(): array
    {
        $v = $this->bga->globals->get(self::GLOBAL_BOARD_FOR_PLAYERS, []);

        return is_array($v) ? array_map('intval', $v) : [];
    }

    public function setBoardForPlayers(array $boardForPlayers): void
    {
        $this->bga->globals->set(self::GLOBAL_BOARD_FOR_PLAYERS, $boardForPlayers);
    }

    /**
     * @param array<string, mixed> $c
     */
    public static function cardIdFromRow(array $c): int
    {
        return (int) ($c['id'] ?? $c['card_id'] ?? 0);
    }

    /**
     * @return array{species:int, vehicle:int, bonus_vp:int, left_move:int, right_move:int}
     */
    public static function animalDefById(int $cardId): array
    {
        $def = Material::ANIMAL_CARDS_DEFINITION[$cardId] ?? null;
        if ($def === null) {
            throw new \Bga\GameFramework\UserException(clienttranslate('Invalid card'));
        }

        return $def;
    }

    /**
     * @return list<array{id:int}>
     */
    public function getHandCardsFor(int $playerId): array
    {
        return array_map(fn ($id) => ['id' => (int) $id], $this->getHands()[$playerId] ?? []);
    }

    /**
     * @return list<array{slot:int, id:int}>
     */
    public function getPoolCards(): array
    {
        $out = [];
        foreach ($this->getPool() as $slot => $id) {
            $out[] = ['slot' => (int) $slot, 'id' => (int) $id];
        }
        usort($out, fn ($a, $b) => $a['slot'] <=> $b['slot']);

        return $out;
    }

    /**
     * @return array<int, list<list<array{id:int}>>>
     */
    public function getPublicBoards(): array
    {
        $rawBoards = $this->getBoards();
        $boards = [];
        foreach ($this->getNextPlayerTable() as $pid => $_) {
            if ($pid === 0) {
                continue;
            }
            $pid = (int) $pid;
            $boards[$pid] = [[], [], []];
            for ($loc = 0; $loc < Material::LOCATION_COUNT; $loc++) {
                $boards[$pid][$loc] = array_map(
                    fn ($id) => ['id' => (int) $id],
                    $rawBoards[$pid][$loc] ?? []
                );
            }
        }

        return $boards;
    }

    public function drawFromAnimalDeckFor(int $playerId): void
    {
        $deck = $this->getDeck();
        if (empty($deck)) {
            $deck = $this->getDiscard();
            shuffle($deck);
            $this->setDiscard([]);
        }
        if (empty($deck)) {
            throw new \Bga\GameFramework\UserException(clienttranslate('The animal deck is empty'));
        }
        $cardId = (int) array_pop($deck);
        $this->setDeck($deck);
        $hands = $this->getHands();
        $hands[$playerId][] = $cardId;
        $this->setHands($hands);
    }

    public function drawFromAnimalDeckToPool(int $slot): void
    {
        $deck = $this->getDeck();
        if (empty($deck)) {
            $deck = $this->getDiscard();
            shuffle($deck);
            $this->setDiscard([]);
        }
        if (empty($deck)) {
            throw new \Bga\GameFramework\UserException(clienttranslate('The animal deck is empty'));
        }
        $cardId = (int) array_pop($deck);
        $this->setDeck($deck);
        $pool = $this->getPool();
        $pool[$slot] = $cardId;
        $this->setPool($pool);
    }

    public function updateObjectiveConditions(): void
    {
        $objectives = $this->getObjectivesState();
        $boards = $this->getPublicBoards();
        $flags = $this->getFlags();
        $pids = [];
        foreach ($this->getNextPlayerTable() as $pid => $_) {
            if ($pid !== 0) {
                $pids[] = (int) $pid;
            }
        }
        foreach ($objectives as $oi => $obj) {
            if (! $obj['active']) {
                continue;
            }
            foreach ($pids as $pid) {
                $status = $obj['players'][$pid] ?? 'unmet';
                if ($status === 'claimed') {
                    continue;
                }
                $meets = $this->evalObjectiveMeets((int) $obj['id'], $pid, $boards, $flags);
                if ($meets) {
                    $objectives[$oi]['players'][$pid] = 'meets';
                } else {
                    if ($status === 'meets') {
                        $objectives[$oi]['players'][$pid] = 'unmet';
                    }
                }
            }
        }
        $this->setObjectivesState($objectives);
    }

    /**
     * @param array<int, list<list<array{id:int}>>> $boards
     * @param array<int, array<int, int>> $flags
     */
    public function evalObjectiveMeets(int $objectiveId, int $playerId, array $boards, array $flags): bool
    {
        return match ($objectiveId) {
            Material::OBJECTIVE_SPECIALISTS_RETREAT => $this->evalObjectiveSpecialistsRetreat($playerId, $boards, $flags),
            Material::OBJECTIVE_COMPARING_NOTES => $this->evalObjectiveComparingNotes($playerId, $boards, $flags),
            Material::OBJECTIVE_MORNING_SHIFT => $this->evalObjectiveMorningShift($playerId, $boards, $flags),
            Material::OBJECTIVE_SPLITTING_UP => $this->evalObjectiveSplittingUp($playerId, $boards, $flags),
            Material::OBJECTIVE_BALANCED_ECOSYSTEM => $this->evalObjectiveBalancedEcosystem($playerId, $boards, $flags),
            Material::OBJECTIVE_RICHNESS_OF_NATURE => $this->evalObjectiveRichnessOfNature($playerId, $boards, $flags),
            Material::OBJECTIVE_SPOTTING_LIST => $this->evalObjectiveSpottingList($playerId, $boards, $flags),
            Material::OBJECTIVE_FAVORITE_RESEARCH_OBJECT => $this->evalObjectiveFavoriteResearchObject($playerId, $boards, $flags),
            Material::OBJECTIVE_ORGANIZED_EXPEDITION => $this->evalObjectiveOrganizedExpedition($playerId, $boards, $flags),
            Material::OBJECTIVE_CLIMBING_THE_AREA => $this->evalObjectiveClimbingTheArea($playerId, $boards, $flags),
            Material::OBJECTIVE_BOLD_EXPLORERS => $this->evalObjectiveBoldExplorers($playerId, $boards, $flags),
            Material::OBJECTIVE_PROMISING_DIRECTION => $this->evalObjectivePromisingDirection($playerId, $boards, $flags),
            default => false,
        };
    }

    private function evalObjectiveSpecialistsRetreat(int $playerId, array $boards, array $flags): bool
    {
        $sci = $this->getScientists();
        if (empty($sci[$playerId])) {
            return false;
        }
        for ($c = 0; $c < Material::SCIENTIST_COLORS; $c++) {
            $positions = $sci[$playerId][$c] ?? [];
            if (count($positions) !== 3) {
                continue;
            }
            $allInCamp = true;
            foreach ($positions as $pos) {
                if ($pos !== BoardModel::POS_CAMP_L && $pos !== BoardModel::POS_CAMP_R) {
                    $allInCamp = false;
                    break;
                }
            }
            if ($allInCamp) {
                return true;
            }
        }

        return false;
    }

    private function evalObjectiveComparingNotes(int $playerId, array $boards, array $flags): bool
    {
        $sci = $this->getScientists();
        if (empty($sci[$playerId])) {
            return false;
        }
        $left = 0;
        $right = 0;
        for ($c = 0; $c < Material::SCIENTIST_COLORS; $c++) {
            foreach ($sci[$playerId][$c] ?? [] as $pos) {
                if ($pos === BoardModel::POS_CAMP_L) $left++;
                if ($pos === BoardModel::POS_CAMP_R) $right++;
            }
        }

        return $left >= 3 || $right >= 3;
    }

    private function evalObjectiveMorningShift(int $playerId, array $boards, array $flags): bool
    {
        $last = $this->getLastReturnedCounts();
        $cnt = (int) ($last[$playerId] ?? 0);

        return $cnt >= 5;
    }

    private function evalObjectiveSplittingUp(int $playerId, array $boards, array $flags): bool
    {
        $sci = $this->getScientists();
        if (empty($sci[$playerId])) {
            return false;
        }
        for ($loc = 0; $loc < Material::LOCATION_COUNT; $loc++) {
            $total = 0;
            for ($c = 0; $c < Material::SCIENTIST_COLORS; $c++) {
                foreach ($sci[$playerId][$c] ?? [] as $pos) {
                    if ($pos === $loc) $total++;
                }
            }
            if ($total > 2) return false;
        }

        return true;
    }

    private function evalObjectiveBalancedEcosystem(int $playerId, array $boards, array $flags): bool
    {
        $playerBoard = $boards[$playerId] ?? [[], [], []];
        for ($loc = 0; $loc < Material::LOCATION_COUNT; $loc++) {
            if (count($playerBoard[$loc] ?? []) < 3) return false;
        }

        return true;
    }

    private function evalObjectiveRichnessOfNature(int $playerId, array $boards, array $flags): bool
    {
        $playerBoard = $boards[$playerId] ?? [[], [], []];
        for ($loc = 0; $loc < Material::LOCATION_COUNT; $loc++) {
            if (count($playerBoard[$loc] ?? []) >= 6) return true;
        }

        return false;
    }

    private function evalObjectiveSpottingList(int $playerId, array $boards, array $flags): bool
    {
        $playerBoard = $boards[$playerId] ?? [[], [], []];
        $found = [];
        foreach ($playerBoard as $pile) {
            foreach ($pile as $c) {
                $def = self::animalDefById((int) $c['id']);
                $found[(int) $def['species']] = true;
            }
        }

        return count($found) >= Material::SPECIES_COUNT;
    }

    private function evalObjectiveFavoriteResearchObject(int $playerId, array $boards, array $flags): bool
    {
        $playerBoard = $boards[$playerId] ?? [[], [], []];
        $counts = array_fill(0, Material::SPECIES_COUNT, 0);
        foreach ($playerBoard as $pile) {
            foreach ($pile as $c) {
                $def = self::animalDefById((int) $c['id']);
                $counts[(int) $def['species']]++;
            }
        }

        foreach ($counts as $cnt) {
            if ($cnt >= 6) return true;
        }

        return false;
    }

    private function evalObjectiveOrganizedExpedition(int $playerId, array $boards, array $flags): bool
    {
        $playerBoard = $boards[$playerId] ?? [[], [], []];
        $counts = array_fill(0, Material::VEHICLE_COUNT, 0);
        foreach ($playerBoard as $pile) {
            foreach ($pile as $c) {
                $def = self::animalDefById((int) $c['id']);
                $counts[(int) $def['vehicle']]++;
            }
        }

        foreach ($counts as $cnt) {
            if ($cnt >= 4) return true;
        }

        return false;
    }

    private function evalObjectiveClimbingTheArea(int $playerId, array $boards, array $flags): bool
    {
        $pflags = $flags[$playerId] ?? [0, 0, 0];
        for ($loc = 0; $loc < Material::LOCATION_COUNT; $loc++) {
            if ((int) ($pflags[$loc] ?? 0) < 2) return false;
        }

        return true;
    }

    private function evalObjectiveBoldExplorers(int $playerId, array $boards, array $flags): bool
    {
        $pflags = $flags[$playerId] ?? [0, 0, 0];
        foreach ($pflags as $f) {
            if ((int) $f >= 5) return true;
        }

        return false;
    }

    private function evalObjectivePromisingDirection(int $playerId, array $boards, array $flags): bool
    {
        $pflags = $flags[$playerId] ?? [0, 0, 0];
        for ($i = 0; $i < Material::LOCATION_COUNT; $i++) {
            for ($j = 0; $j < Material::LOCATION_COUNT; $j++) {
                if ($i === $j) continue;
                if ((int) ($pflags[$i] ?? 0) >= (int) ($pflags[$j] ?? 0) + 4) return true;
            }
        }

        return false;
    }

    /**
     * @param list<array{id:int, active:bool, players:array<int, string>}> $objectives
     */
    public function claimObjective(int $activePlayerId, int $objectiveIndex): void
    {
        $objectives = $this->getObjectivesState();
        if (! isset($objectives[$objectiveIndex])) {
            throw new \Bga\GameFramework\UserException(clienttranslate('Invalid objective'));
        }
        $obj = $objectives[$objectiveIndex];
        if (! $obj['active']) {
            throw new \Bga\GameFramework\UserException(clienttranslate('This objective is no longer active'));
        }
        $st = $obj['players'][$activePlayerId] ?? 'unmet';
        if ($st !== 'meets') {
            throw new \Bga\GameFramework\UserException(clienttranslate('You cannot claim this objective yet'));
        }

        $oid = (int) $objectives[$objectiveIndex]['id'];
        $claimerName = $this->getPlayerNameById($activePlayerId);
        $objectivesData = Material::getObjectivesData();
        $objectiveTitle = $objectivesData[$oid]['title'] ?? '';

        foreach ($this->getNextPlayerTable() as $pid => $_) {
            if ($pid === 0) continue;
            $this->bga->notify->player(
                (int)$pid,
                'objectiveClaimed',
                clienttranslate('${player_name} claimed objective ${objective_title}'),
                [
                    'player_id' => $activePlayerId,
                    'player_name' => $claimerName,
                    'objective_index' => $objectiveIndex,
                    'objective_id' => $oid,
                    'objective_title' => $objectiveTitle,
                    'boardState' => $this->getBoardState((int)$pid),
                ]
            );
        }

        foreach ($this->getNextPlayerTable() as $pid => $_) {
            if ($pid === 0) {
                continue;
            }
            $pid = (int) $pid;
            $ps = $objectives[$objectiveIndex]['players'][$pid] ?? 'unmet';
            if ($ps === 'meets') {
                $objectives[$objectiveIndex]['players'][$pid] = 'claimed';
                $this->bga->playerScore->inc($pid, 5, null);
            }

            $scorerName = $this->getPlayerNameById($pid);

            foreach ($this->getNextPlayerTable() as $pid2 => $_2) {
                if ($pid2 === 0) continue;
                $this->bga->notify->player(
                    (int)$pid2,
                    'objectiveScored',
                    clienttranslate('${player_name} gained ${score} VP for objective ${objective_title}'),
                    [
                        'player_id' => $pid,
                        'player_name' => $scorerName,
                        'objective_index' => $objectiveIndex,
                        'objective_id' => $oid,
                        'objective_title' => $objectiveTitle,
                        'score' => 5,
                        'boardState' => $this->getBoardState((int)$pid2),
                    ]
                );
            }
        }
        $this->setObjectivesState($objectives);

    }

    public function deactivateClaimedObjectives(): void
    {
        $objectives = $this->getObjectivesState();
        foreach ($objectives as $i => $obj) {
            $any = false;
            foreach ($obj['players'] as $st) {
                if ($st === 'claimed') {
                    $any = true;
                    break;
                }
            }
            if ($any) {
                $objectives[$i]['active'] = false;
            }
        }
        $this->setObjectivesState($objectives);
    }

    public function playersWithLocationSevenPlusCards(): array
    {
        $boards = $this->getBoards();
        $players = [];
        foreach ($this->getNextPlayerTable() as $pid => $_) {
            if ($pid === 0) {
                continue;
            }
            $pid = (int) $pid;
            for ($loc = 0; $loc < Material::LOCATION_COUNT; $loc++) {
                if (count($boards[$pid][$loc] ?? []) >= 7) {
                    $players[] = $pid;
                    break;
                }
            }
        }

        return $players;
    }

    public function applyEndScoring(): void
    {
        $boards = $this->getPublicBoards();
        $flags = $this->getFlags();
        $sci = $this->getScientists();
        $scoringIds = $this->getScoringCardIds();

        // Friendly labels for locations (translated)
        $locNames = [clienttranslate('Left'), clienttranslate('Middle'), clienttranslate('Right')];

        foreach ($this->getNextPlayerTable() as $pid => $_) {
            if ($pid === 0) {
                continue;
            }
            $pid = (int) $pid;
            $playerName = $this->getPlayerNameById($pid);
            $rawColor = (string) $this->getPlayerColorById($pid);
            $color = ltrim($rawColor, '#');
            $anchor = "bae_playerboard_{$pid}";

            // Species sets per location
            for ($loc = 0; $loc < Material::LOCATION_COUNT; $loc++) {
                $vp = $this->scoreSpeciesSets($boards[$pid][$loc] ?? []);
                if ($vp === 0) continue;
                foreach ($this->getNextPlayerTable() as $recipient => $_2) {
                    if ($recipient === 0) continue;
                    $this->bga->notify->player(
                        (int)$recipient,
                        'scoringStep',
                        clienttranslate('${player_name} gains ${amount} VP from species sets at ${location}'),
                        [
                            'player_id' => $pid,
                            'amount' => $vp,
                            'player_name' => $playerName,
                            'location' => $locNames[$loc] ?? $loc,
                            'anchor_id' => $anchor,
                            'color' => $color,
                            'boardState' => $this->getBoardState((int)$recipient),
                        ]
                    );
                }
                $this->bga->playerScore->inc($pid, $vp, null);
            }

            // Track VP per location
            for ($loc = 0; $loc < Material::LOCATION_COUNT; $loc++) {
                $fi = (int) ($flags[$pid][$loc] ?? 0);
                $vp = (Material::TRACK_SPACE_VP[$loc] ?? [])[$fi] ?? 0;
                if ($vp === 0) continue;
                foreach ($this->getNextPlayerTable() as $recipient => $_2) {
                    if ($recipient === 0) continue;
                    $this->bga->notify->player(
                        (int)$recipient,
                        'scoringStep',
                        clienttranslate('${player_name} gains ${amount} VP from the exploration track at ${location}'),
                        [
                            'player_id' => $pid,
                            'amount' => $vp,
                            'player_name' => $playerName,
                            'location' => $locNames[$loc] ?? $loc,
                            'anchor_id' => $anchor,
                            'color' => $color,
                            'boardState' => $this->getBoardState((int)$recipient),
                        ]
                    );
                }
                $this->bga->playerScore->inc($pid, $vp, null);
            }

            // Bonus VP from animal cards (animate per card)
            foreach ($boards[$pid] ?? [] as $pile) {
                foreach ($pile as $c) {
                    $def = self::animalDefById((int) $c['id']);
                    $bonus = (int) ($def['bonus_vp'] ?? 0);
                    if ($bonus === 0) continue;
                    foreach ($this->getNextPlayerTable() as $recipient => $_2) {
                        if ($recipient === 0) continue;
                        $this->bga->notify->player(
                            (int)$recipient,
                            'scoringStep',
                            clienttranslate('${player_name} gains ${amount} VP from animal card #${card_id}'),
                            [
                                'player_id' => $pid,
                                'amount' => $bonus,
                                'player_name' => $playerName,
                                'card_id' => (int) $c['id'],
                                'anchor_id' => $anchor,
                                'color' => $color,
                                'boardState' => $this->getBoardState((int)$recipient),
                            ]
                        );
                    }
                    $this->bga->playerScore->inc($pid, $bonus, null);
                }
            }

            // Scoring card contributions
            foreach ($scoringIds as $sid) {
                $delta = $this->scoreEndCard($sid, $pid, $boards, $flags, $sci);
                if ($delta === 0) continue;
                foreach ($this->getNextPlayerTable() as $recipient => $_2) {
                    if ($recipient === 0) continue;
                    $this->bga->notify->player(
                        (int)$recipient,
                        'scoringStep',
                        clienttranslate('${player_name} gains ${amount} VP from scoring card #${scoring_id}'),
                        [
                            'player_id' => $pid,
                            'amount' => $delta,
                            'player_name' => $playerName,
                            'scoring_id' => (int) $sid,
                            'anchor_id' => $anchor,
                            'color' => $color,
                            'boardState' => $this->getBoardState((int)$recipient),
                        ]
                    );
                }
                $this->bga->playerScore->inc($pid, $delta, null);
            }
        }
    }

    /**
     * @param list<array{id:int}> $pile
     */
    private function scoreSpeciesSets(array $pile): int
    {
        $by = array_fill(0, Material::SPECIES_COUNT, 0);
        foreach ($pile as $c) {
            $def = self::animalDefById((int) $c['id']);
            $by[(int) $def['species']]++;
        }
        $vp = 0;
        foreach ($by as $cnt) {
            if ($cnt > 0) {
                $vp += Material::SPECIES_SET_VP[min($cnt, count(Material::SPECIES_SET_VP) - 1)] ?? 0;
            }
        }

        return $vp;
    }

    /**
     * @param array<int, list<list<array{id:int}>>> $boards
     * @param array<int, array<int, int>> $flags
     * @param array<int, array<int, list<int>>> $sci
     */
    private function scoreEndCard(int $scoringId, int $playerId, array $boards, array $flags, array $sci): int
    {
        return match ($scoringId) {
            Material::SCORE_COMMON_DESTINATION => $this->scoreCommonDestination($playerId, $boards, $flags, $sci),
            Material::SCORE_EXPANSIVE_SPECIES => $this->scoreExpansiveSpecies($playerId, $boards, $flags, $sci),
            Material::SCORE_FAREWELL_PARTY => $this->scoreFarewellParty($playerId, $boards, $flags, $sci),
            Material::SCORE_INTERSPECIES => $this->scoreInterspecies($playerId, $boards, $flags, $sci),
            Material::SCORE_MATING_SEASON => $this->scoreMatingSeason($playerId, $boards, $flags, $sci),
            Material::SCORE_OUTER_LANDS => $this->scoreOuterLands($playerId, $boards, $flags, $sci),
            Material::SCORE_POPULAR_VEHICLE => $this->scorePopularVehicle($playerId, $boards, $flags, $sci),
            Material::SCORE_SAFE_RETURN => $this->scoreSafeReturn($playerId, $boards, $flags, $sci),
            Material::SCORE_UNTRODDEN_PATH => $this->scoreUntroddenPath($playerId, $boards, $flags, $sci),
            Material::SCORE_TERRITORIAL_ANIMALS => $this->scoreTerritorialAnimals($playerId, $boards, $flags, $sci),
            default => 0,
        };
    }

    private function scoreCommonDestination(int $playerId, array $boards, array $flags, array $sci): int
    {
        $pflags = $flags[$playerId] ?? [0, 0, 0];
        $a = (int) ($pflags[0] ?? 0);
        $b = (int) ($pflags[1] ?? 0);
        $c = (int) ($pflags[2] ?? 0);
        if ($a === $b && $b === $c) return 12;
        if ($a === $b || $a === $c || $b === $c) return 5;

        return 0;
    }

    private function scoreExpansiveSpecies(int $playerId, array $boards, array $flags, array $sci): int
    {
        $playerBoard = $boards[$playerId] ?? [[], [], []];
        $counts = [count($playerBoard[0] ?? []), count($playerBoard[1] ?? []), count($playerBoard[2] ?? [])];
        $maxDepth = min($counts[0], $counts[1], $counts[2]);
        $vp = 0;
        for ($d = 0; $d < $maxDepth; $d++) {
            $left = $playerBoard[0][$d] ?? null;
            $mid = $playerBoard[1][$d] ?? null;
            $right = $playerBoard[2][$d] ?? null;
            if ($left === null || $mid === null || $right === null) continue;
            $ls = (int) self::animalDefById((int) $left['id'])['species'];
            $ms = (int) self::animalDefById((int) $mid['id'])['species'];
            $rs = (int) self::animalDefById((int) $right['id'])['species'];
            if ($ls === $ms && $ms === $rs) {
                $vp += 5;
            }
        }

        return $vp;
    }

    private function scoreFarewellParty(int $playerId, array $boards, array $flags, array $sci): int
    {
        $counts = [0, 0, 0];
        foreach ($sci[$playerId] ?? [] as $color => $list) {
            foreach ($list as $pos) {
                if ($pos === BoardModel::POS_LEFT) $counts[0]++;
                if ($pos === BoardModel::POS_MID) $counts[1]++;
                if ($pos === BoardModel::POS_RIGHT) $counts[2]++;
            }
        }
        $max = max($counts[0], $counts[1], $counts[2]);

        return $max * 2;
    }

    private function scoreInterspecies(int $playerId, array $boards, array $flags, array $sci): int
    {
        $playerBoard = $boards[$playerId] ?? [[], [], []];
        $vp = 0;
        foreach ($playerBoard as $pile) {
            $sp = [];
            foreach ($pile as $c) {
                $def = self::animalDefById((int) $c['id']);
                $sp[(int) $def['species']] = true;
            }
            if (count($sp) === 2) $vp += 3;
        }

        return $vp;
    }

    private function scoreMatingSeason(int $playerId, array $boards, array $flags, array $sci): int
    {
        $playerBoard = $boards[$playerId] ?? [[], [], []];
        $vp = 0;
        foreach ($playerBoard as $pile) {
            $speciesSeq = [];
            foreach ($pile as $c) {
                $def = self::animalDefById((int) $c['id']);
                $speciesSeq[] = (int) $def['species'];
            }
            $n = count($speciesSeq);
            $i = 0;
            while ($i < $n) {
                $j = $i + 1;
                while ($j < $n && $speciesSeq[$j] === $speciesSeq[$i]) $j++;
                $run = $j - $i;
                if ($run === 2) $vp += 2;
                $i = $j;
            }
        }

        return $vp;
    }

    private function scoreOuterLands(int $playerId, array $boards, array $flags, array $sci): int
    {
        $playerBoard = $boards[$playerId] ?? [[], [], []];
        $counts = [count($playerBoard[0] ?? []), count($playerBoard[1] ?? []), count($playerBoard[2] ?? [])];
        $mid = $counts[1];
        $vp = 0;
        foreach ([0, 2] as $i) {
            if ($counts[$i] > $mid) $vp += 7;
        }

        return $vp;
    }

    private function scorePopularVehicle(int $playerId, array $boards, array $flags, array $sci): int
    {
        $playerBoard = $boards[$playerId] ?? [[], [], []];
        $counts = array_fill(0, Material::VEHICLE_COUNT, 0);
        foreach ($playerBoard as $pile) {
            foreach ($pile as $c) {
                $def = self::animalDefById((int) $c['id']);
                $counts[(int) $def['vehicle']]++;
            }
        }
        $max = max($counts);

        return $max * 2;
    }

    private function scoreSafeReturn(int $playerId, array $boards, array $flags, array $sci): int
    {
        return BoardModel::countScientistsInCamps($sci, $playerId) * 3;
    }

    private function scoreUntroddenPath(int $playerId, array $boards, array $flags, array $sci): int
    {
        $pflags = $flags[$playerId] ?? [0, 0, 0];
        $values = [];
        foreach ($pflags as $loc => $f) {
            $values[] = (Material::TRACK_SPACE_VP[$loc] ?? [])[ $f ] ?? 0;
        }
        if (empty($values)) return 0;

        return min($values) * 2;
    }

    private function scoreTerritorialAnimals(int $playerId, array $boards, array $flags, array $sci): int
    {
        $playerBoard = $boards[$playerId] ?? [[], [], []];
        $vp = 0;
        foreach ($playerBoard as $pile) {
            $ok = true;
            $prev = null;
            foreach ($pile as $c) {
                $def = self::animalDefById((int) $c['id']);
                $sp = (int) $def['species'];
                if ($prev !== null && $prev === $sp) {
                    $ok = false;
                    break;
                }
                $prev = $sp;
            }
            if ($ok) $vp += 6;
        }

        return $vp;
    }


    protected function setupNewGame($players, $options = [])
    {
        $playerIds = array_map('intval', array_keys($players));

        $gameinfos = $this->getGameinfos();
        $default_colors = $gameinfos['player_colors'];
        $query_values = [];
        foreach ($players as $player_id => $player) {
            $query_values[] = vsprintf('(%s, \'%s\', \'%s\')', [
                $player_id,
                array_shift($default_colors),
                addslashes($player['player_name']),
            ]);
        }
        static::DbQuery(
            sprintf(
                'INSERT INTO `player` (`player_id`, `player_color`, `player_name`) VALUES %s',
                implode(',', $query_values)
            )
        );
        $this->reattributeColorsBasedOnPreferences($players, $gameinfos['player_colors']);
        $this->reloadPlayersBasicInfos();
        $this->bga->playerScore->initDb($playerIds, 2);

        $deck = array_keys(Material::ANIMAL_CARDS_DEFINITION);
        shuffle($deck);

        $pool = [];
        for ($slot = 0; $slot < 4; $slot++) {
            $pool[$slot] = (int) array_pop($deck);
        }
        $this->setPool($pool);

        $hands = [];
        foreach ($playerIds as $pid) {
            $hands[$pid] = [];
            for ($i = 0; $i < 4; $i++) {
                $hands[$pid][] = (int) array_pop($deck);
            }
        }
        $this->setHands($hands);

        $this->setDeck(array_values($deck));
        $this->setDiscard([]);

        $boards = [];
        foreach ($playerIds as $pid) {
            $boards[$pid] = [[], [], []];
        }
        $this->setBoards($boards);

        $this->setScientists(BoardModel::initialScientists($playerIds));
        $this->setFlags(BoardModel::initialFlags($playerIds));

        $objPick = [];
        $objTypes = Material::getObjectivesByType();
        shuffle($objTypes['animal']);
        shuffle($objTypes['scientist']);
        shuffle($objTypes['vehicle']);
        foreach ([$objTypes['animal'][0], $objTypes['scientist'][0], $objTypes['vehicle'][0]] as $oid) {
            $playersSt = [];
            foreach ($playerIds as $pid) {
                $playersSt[$pid] = 'unmet';
            }
            $objPick[] = ['id' => $oid, 'active' => true, 'players' => $playersSt];
        }
        $this->setObjectivesState($objPick);

        $scorePool = Material::allScoringCardIds();
        shuffle($scorePool);
        $this->setScoringCardIds([(int) $scorePool[0], (int) $scorePool[1]]);

        $mull = [];
        foreach ($playerIds as $pid) {
            $mull[$pid] = false;
        }
        $this->setMulliganUsed($mull);

        // Assign a random board to the players:
        $boardForPlayers = [];
        $boardOptions = array_keys(Material::getPlayerBoardsData());
        shuffle($boardOptions);
        foreach ($playerIds as $pid) {
            $boardForPlayers[$pid] = array_pop($boardOptions);
        }
        $this->setBoardForPlayers($boardForPlayers);

        $this->activeNextPlayer();
        $order = $this->getNextPlayerTable();
        $this->setRoundLeaderId((int) $order[0]);
        $this->updateObjectiveConditions();

        return OpeningMulligan::class;
    }

    public function upgradeTableDb($from_version)
    {
    }

    public function debug_goToState(int $state = 3)
    {
        $this->gamestate->jumpToState($state);
    }

    public function debug_playOneMove()
    {
        $this->bga->debug->playUntil(fn (int $count) => $count == 1);
    }
}
