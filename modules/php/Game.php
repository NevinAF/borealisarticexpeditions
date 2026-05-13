<?php

declare(strict_types=1);

namespace Bga\Games\BorealisArticExpeditions;

use Bga\Games\BorealisArticExpeditions\States\Gameplay;

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
        $boardA = Material::getPlayerBoardsData()[0] ?? null;
        $result['track'] = [
            'vpPerSpace' => Material::TRACK_SPACE_VP,
            'vehiclesPerLocation' => [
                $boardA['left_location'] ?? [],
                $boardA['mid_location'] ?? [],
                $boardA['right_location'] ?? [],
            ],
        ];
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
            Material::OBJECTIVE_SPOTTING_LIST => $this->countSpeciesOnBoard($boards, $playerId, 0) >= 5,
            Material::OBJECTIVE_MORNING_SHIFT => $this->maxScientistsOneLocation($playerId) >= 5,
            Material::OBJECTIVE_BOLD_EXPLORERS => $this->maxFlag($flags, $playerId) >= 5,
            default => false,
        };
    }

    /**
     * @param array<int, list<list<array{id:int}>>> $boards
     */
    private function countSpeciesOnBoard(array $boards, int $playerId, int $species): int
    {
        $n = 0;
        foreach ($boards[$playerId] ?? [] as $pile) {
            foreach ($pile as $c) {
                $def = self::animalDefById((int) $c['id']);
                if ((int) $def['species'] === $species) {
                    $n++;
                }
            }
        }

        return $n;
    }

    private function maxScientistsOneLocation(int $playerId): int
    {
        $sci = $this->getScientists();
        $best = 0;
        for ($loc = 0; $loc < Material::LOCATION_COUNT; $loc++) {
            $t = 0;
            for ($c = 0; $c < Material::SCIENTIST_COLORS; $c++) {
                $t += BoardModel::colorCountAtLocation($sci, $playerId, $loc, $c);
            }
            $best = max($best, $t);
        }

        return $best;
    }

    /**
     * @param array<int, array<int, int>> $flags
     */
    private function maxFlag(array $flags, int $playerId): int
    {
        $m = 0;
        foreach ($flags[$playerId] ?? [] as $v) {
            $m = max($m, (int) $v);
        }

        return $m;
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
        }
        $this->setObjectivesState($objectives);
        $oid = (int) $objectives[$objectiveIndex]['id'];
        foreach ($this->getNextPlayerTable() as $pid => $_) {
            if ($pid === 0) continue;
            $this->bga->notify->player(
                (int)$pid,
                'objectiveClaimed',
                clienttranslate('Players claimed an objective'),
                [
                    'objective_index' => $objectiveIndex,
                    'objective_id' => $oid,
                    'boardState' => $this->getBoardState((int)$pid),
                ]
            );
        }
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

    public function anyLocationHasSevenPlusCards(): bool
    {
        $boards = $this->getBoards();
        foreach ($this->getNextPlayerTable() as $pid => $_) {
            if ($pid === 0) {
                continue;
            }
            $pid = (int) $pid;
            for ($loc = 0; $loc < Material::LOCATION_COUNT; $loc++) {
                if (count($boards[$pid][$loc] ?? []) >= 7) {
                    return true;
                }
            }
        }

        return false;
    }

    public function applyEndScoring(): void
    {
        $boards = $this->getPublicBoards();
        $flags = $this->getFlags();
        $sci = $this->getScientists();
        $scoringIds = $this->getScoringCardIds();
        foreach ($this->getNextPlayerTable() as $pid => $_) {
            if ($pid === 0) {
                continue;
            }
            $pid = (int) $pid;
            $add = 0;
            for ($loc = 0; $loc < Material::LOCATION_COUNT; $loc++) {
                $add += $this->scoreSpeciesSets($boards[$pid][$loc] ?? []);
            }
            for ($loc = 0; $loc < Material::LOCATION_COUNT; $loc++) {
                $fi = (int) ($flags[$pid][$loc] ?? 0);
                $add += Material::TRACK_SPACE_VP[$fi] ?? 0;
            }
            foreach ($boards[$pid] ?? [] as $pile) {
                foreach ($pile as $c) {
                    $def = self::animalDefById((int) $c['id']);
                    $add += (int) $def['bonus_vp'];
                }
            }
            foreach ($scoringIds as $sid) {
                $add += $this->scoreEndCard($sid, $pid, $boards, $flags, $sci);
            }
            if ($add > 0) {
                $this->bga->playerScore->inc($pid, $add, null);
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
            Material::SCORE_INTERSPECIES => $this->scoreInterspecies($boards[$playerId] ?? []),
            Material::SCORE_SAFE_RETURN => BoardModel::countScientistsInCamps($sci, $playerId) * 3,
            Material::SCORE_OUTER_LANDS => $this->scoreOuterLands($boards[$playerId] ?? []),
            default => 0,
        };
    }

    /**
     * @param list<list<array{id:int}>> $playerBoard
     */
    private function scoreInterspecies(array $playerBoard): int
    {
        $vp = 0;
        foreach ($playerBoard as $pile) {
            $sp = [];
            foreach ($pile as $c) {
                $def = self::animalDefById((int) $c['id']);
                $sp[(int) $def['species']] = true;
            }
            if (count($sp) === 2) {
                $vp += 3;
            }
        }

        return $vp;
    }

    /**
     * @param list<list<array{id:int}>> $playerBoard
     */
    private function scoreOuterLands(array $playerBoard): int
    {
        $counts = [
            count($playerBoard[0] ?? []),
            count($playerBoard[1] ?? []),
            count($playerBoard[2] ?? []),
        ];
        $mid = $counts[1];
        $vp = 0;
        foreach ([0, 2] as $i) {
            if ($counts[$i] > $mid) {
                $vp += 7;
            }
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

        $this->activeNextPlayer();
        $order = $this->getNextPlayerTable();
        $this->setRoundLeaderId((int) $order[0]);
        $this->updateObjectiveConditions();

        return Gameplay::class;
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
