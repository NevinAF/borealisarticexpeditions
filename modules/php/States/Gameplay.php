<?php

declare(strict_types=1);

namespace Bga\Games\BorealisArticExpeditions\States;

use Bga\GameFramework\Actions\Types\IntParam;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\BorealisArticExpeditions\BoardModel;
use Bga\Games\BorealisArticExpeditions\Game;
use Bga\Games\BorealisArticExpeditions\Material;

class Gameplay extends GameState
{
    public function __construct(
        protected Game $game,
    ) {
        parent::__construct(
            $game,
            id: 10,
            type: StateType::ACTIVE_PLAYER,
            name: 'gameplay',
            description: clienttranslate('Waiting for ${actplayer}'),
            descriptionMyTurn: clienttranslate('${you} must observe an animal or regroup'),
        );
    }

    public function getArgs(): array
    {
        return [
            'locationCount' => Material::LOCATION_COUNT,
        ];
    }

    /**
     * @throws UserException
     */
    #[PossibleAction]
    public function actObserveAnimal(
        #[IntParam(min: 0)] int $card_id,
        #[IntParam(min: 0, max: 2)] int $location,
        int $activePlayerId,
        array $args,
    ) {
        $g = $this->game;
        $hands = $g->getHands();
        $playerHand = $hands[$activePlayerId] ?? [];
        $handIndex = array_search($card_id, $playerHand, true);
        if ($handIndex === false) {
            throw new UserException(clienttranslate('That card is not in your hand'));
        }
        $sci = $g->getScientists();
        $def = Game::animalDefById($card_id);
        $moves = [
            ['color' => (int) $def['left_move'], 'dir' => 'shift_left'],
            ['color' => (int) $def['right_move'], 'dir' => 'shift_right'],
        ];
        $sci = BoardModel::applyObserveMoves($sci, $activePlayerId, $location, $moves);
        $flags = $g->getFlags();
        $fi = (int) ($flags[$activePlayerId][$location] ?? 0);
        if ($fi < 7) {
            $next = $fi + 1;
            $boardA = Material::getPlayerBoardsData()[0] ?? null;
            $vehiclesPerLocation = [
                $boardA['left_location'] ?? [],
                $boardA['mid_location'] ?? [],
                $boardA['right_location'] ?? [],
            ];
            $vehiclesOnSpace = $vehiclesPerLocation[$location][$next - 1] ?? [];
            if (in_array((int) $def['vehicle'], $vehiclesOnSpace, true)) {
                $flags[$activePlayerId][$location] = $fi + 1;
            }
        }
        $g->setScientists($sci);
        $g->setFlags($flags);

        array_splice($playerHand, $handIndex, 1);
        $hands[$activePlayerId] = array_values($playerHand);
        $g->setHands($hands);
        $boards = $g->getBoards();
        $boards[$activePlayerId][$location][] = $card_id;
        $g->setBoards($boards);

        $g->updateObjectiveConditions();

        foreach ($g->getNextPlayerTable() as $pid => $_) {
            if ($pid === 0) continue;
            $this->bga->notify->player(
                (int)$pid,
                'observeAnimal',
                clienttranslate('${player_name} observes an animal'),
                [
                    'player_id' => $activePlayerId,
                    'player_name' => $g->getPlayerNameById($activePlayerId),
                    'card_id' => $card_id,
                    'location' => $location,
                    'boardState' => $g->getBoardState((int)$pid),
                ]
            );
        }

        return ReplenishAnimalCard::class;
    }

    /**
     * Regroup: discard selected hand cards, draw replacements, gain VP from camps, then assign scientists.
     * Empty discard is allowed. Card list is sent as JSON because some clients omit empty JSON arrays for array params.
     *
     * @throws UserException
     */
    #[PossibleAction]
    public function actRegroup(string $card_ids_json, int $activePlayerId, array $args): mixed
    {
        $g = $this->game;
        $decoded = json_decode($card_ids_json, true);
        if (! is_array($decoded)) {
            $decoded = json_decode(stripslashes($card_ids_json), true);
        }
        $ids = is_array($decoded) ? array_map('intval', $decoded) : [];
        if (count($ids) !== count(array_unique($ids))) {
            throw new UserException(clienttranslate('Duplicate cards in regroup selection'));
        }
        $hands = $g->getHands();
        $playerHand = $hands[$activePlayerId] ?? [];
        foreach ($ids as $cid) {
            if (array_search($cid, $playerHand, true) === false) {
                throw new UserException(clienttranslate('Invalid card for regroup'));
            }
        }
        $discard = $g->getDiscard();
        foreach ($ids as $cid) {
            $idx = array_search($cid, $playerHand, true);
            array_splice($playerHand, $idx, 1);
            $discard[] = $cid;
        }
        $hands[$activePlayerId] = array_values($playerHand);
        $g->setHands($hands);
        $g->setDiscard($discard);
        foreach ($ids as $_) {
            $g->drawFromAnimalDeckFor($activePlayerId);
        }
        $camp = BoardModel::countScientistsInCamps($g->getScientists(), $activePlayerId);
        if ($camp > 0) {
            $this->bga->playerScore->inc($activePlayerId, $camp, null);
        }
        foreach ($g->getNextPlayerTable() as $pid => $_) {
            if ($pid === 0) continue;
            $this->bga->notify->player(
                (int)$pid,
                'regroup',
                clienttranslate('${player_name} regroups'),
                [
                    'player_id' => $activePlayerId,
                    'player_name' => $g->getPlayerNameById($activePlayerId),
                    'discarded' => $ids,
                    'vp_from_camps' => $camp,
                    'boardState' => $g->getBoardState((int)$pid),
                ]
            );
        }

        return AssignCampScientists::class;
    }

    #[PossibleAction]
    public function actClaimObjective(
        #[IntParam(min: 0, max: 2)] int $objective_index,
        int $activePlayerId,
        array $args,
    ) {
        $this->game->claimObjective($activePlayerId, $objective_index);

        return null;
    }

    public function zombie(int $playerId)
    {
        return $this->actRegroup('[]', $playerId, $this->getArgs());
    }
}
