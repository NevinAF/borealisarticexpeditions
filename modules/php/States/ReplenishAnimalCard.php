<?php

declare(strict_types=1);

namespace Bga\Games\BorealisArticExpeditions\States;

use Bga\GameFramework\Actions\Types\IntParam;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\BorealisArticExpeditions\Game;
use Bga\Games\BorealisArticExpeditions\States\PromptClaimObjective;

class ReplenishAnimalCard extends GameState
{
    public function __construct(
        protected Game $game,
    ) {
        parent::__construct(
            $game,
            id: 11,
            type: StateType::ACTIVE_PLAYER,
            name: 'replenishAnimal',
            description: clienttranslate('Waiting for ${actplayer}'),
            descriptionMyTurn: clienttranslate('${you}: take a card'),
        );
    }

    public function getArgs(): array
    {
        $pid = (int) $this->game->getActivePlayerId();
        $mull = $this->game->getMulliganUsed();
        $canMulligan = ($this->bga->playerScore->get($pid) >= 1) && empty($mull[$pid]);

        return [
            'pool' => $this->game->getPoolCards(),
            'canMulligan' => $canMulligan,
        ];
    }

    /**
     * @throws UserException
     */
    #[PossibleAction]
    public function actTakeAnimal(
        #[IntParam(min: -1, max: 3)] int $pool_slot,
        int $activePlayerId,
        array $args,
    ) {
        $g = $this->game;
        if ($pool_slot === -1) {
            $g->drawFromAnimalDeckFor($activePlayerId);
            foreach ($g->getNextPlayerTable() as $pid => $_) {
                if ($pid === 0) continue;
                $this->bga->notify->player(
                    (int)$pid,
                    'takeAnimal',
                    clienttranslate('${player_name} draws from the deck'),
                    [
                        'player_id' => $activePlayerId,
                        'player_name' => $g->getPlayerNameById($activePlayerId),
                        'from_deck' => true,
                        'boardState' => $g->getBoardState((int)$pid),
                    ]
                );
            }
        } else {
            $pool = $g->getPool();
            if (! isset($pool[$pool_slot])) {
                throw new UserException(clienttranslate('That pool slot is empty'));
            }
            $cardId = (int) $pool[$pool_slot];
            unset($pool[$pool_slot]);
            $g->setPool($pool);
            $hands = $g->getHands();
            $hands[$activePlayerId][] = $cardId;
            $g->setHands($hands);
            $g->drawFromAnimalDeckToPool($pool_slot);
            foreach ($g->getNextPlayerTable() as $pid => $_) {
                if ($pid === 0) continue;
                $this->bga->notify->player(
                    (int)$pid,
                    'takeAnimal',
                    clienttranslate('${player_name} takes a card from the pool'),
                    [
                        'player_id' => $activePlayerId,
                        'player_name' => $g->getPlayerNameById($activePlayerId),
                        'from_deck' => false,
                        'pool_slot' => $pool_slot,
                        'boardState' => $g->getBoardState((int)$pid),
                    ]
                );
            }
        }
        $g->updateObjectiveConditions();

        return NextPlayer::class;
    }

    #[PossibleAction]
    public function actMulliganPool(int $activePlayerId, array $args)
    {
        $g = $this->game;
        $pid = $activePlayerId;
        if ($this->bga->playerScore->get($pid) < 1) {
            throw new UserException(clienttranslate('You need at least 1 VP to mulligan the pool'));
        }
        $mull = $g->getMulliganUsed();
        if (! empty($mull[$pid])) {
            throw new UserException(clienttranslate('You can only mulligan the pool once per game'));
        }
        $this->bga->playerScore->inc($pid, -1, null);
        $poolCards = $g->getPool();
        $discard = $g->getDiscard();
        foreach ($poolCards as $id) {
            $discard[] = (int) $id;
        }
        $g->setDiscard($discard);
        $g->setPool([]);
        for ($slot = 0; $slot < 4; $slot++) {
            $g->drawFromAnimalDeckToPool($slot);
        }
        $mull[$pid] = true;
        $g->setMulliganUsed($mull);

        foreach ($g->getNextPlayerTable() as $otherPid => $_) {
            if ($otherPid === 0) continue;
            $this->bga->notify->player(
                (int)$otherPid,
                'mulliganPool',
                clienttranslate('${player_name} pays 1 VP to refresh the pool'),
                [
                    'player_id' => $pid,
                    'player_name' => $g->getPlayerNameById($pid),
                    'boardState' => $g->getBoardState((int)$otherPid),
                ]
            );
        }

        return ReplenishAnimalCard::class;
    }

    #[PossibleAction]
    public function actClaimObjective(
        #[IntParam(min: 0, max: 2)] int $objective_index,
        int $activePlayerId,
        array $args,
    ) {
        $this->game->claimObjective($activePlayerId, $objective_index);

        if ($this->game->hasPendingObjectivePrompts()) {
            return PromptClaimObjective::class;
        }

        return null;
    }

    public function zombie(int $playerId)
    {
        return $this->actTakeAnimal(-1, $playerId, $this->getArgs());
    }
}
