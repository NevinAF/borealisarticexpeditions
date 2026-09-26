<?php

declare(strict_types=1);

namespace Bga\Games\BorealisArcticExpeditions\States;

use Bga\GameFramework\Actions\Types\IntParam;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\BorealisArcticExpeditions\Game;

class OpeningMulligan extends GameState
{
    public function __construct(
        protected Game $game,
    ) {
        parent::__construct(
            $game,
            id: 5,
            type: StateType::MULTIPLE_ACTIVE_PLAYER,
            name: 'openingMulligan',
            description: clienttranslate('Waiting for ${actplayer} to mulligan'),
            descriptionMyTurn: clienttranslate('${you}: mulligan your starting hand'),
        );
    }

    public function onEnteringState(?int $activePlayerId = null): void
    {
        $this->game->stMakeEveryoneActive();
    }

    public function getArgs(): array
    {
        return [];
    }

    /**
     * @throws UserException
     */
    #[PossibleAction]
    public function actMulliganHand(
        string $card_ids_json,
        int $currentPlayerId,
        array $args,
    ): mixed {
        $g = $this->game;
        $decoded = json_decode($card_ids_json, true);
        if (! is_array($decoded)) {
            $decoded = json_decode(stripslashes($card_ids_json), true);
        }
        $ids = is_array($decoded) ? array_map('intval', $decoded) : [];
        if (count($ids) !== count(array_unique($ids))) {
            throw new UserException(clienttranslate('Duplicate cards in mulligan selection'));
        }

        $hands = $g->getHands();
        $playerHand = $hands[$currentPlayerId] ?? [];
        foreach ($ids as $cid) {
            if (array_search($cid, $playerHand, true) === false) {
                throw new UserException(clienttranslate('Invalid card for mulligan'));
            }
        }

        $discard = $g->getDiscard();
        foreach ($ids as $cid) {
            $idx = array_search($cid, $playerHand, true);
            array_splice($playerHand, $idx, 1);
            $discard[] = $cid;
        }
        $hands[$currentPlayerId] = array_values($playerHand);
        $g->setHands($hands);
        $g->setDiscard($discard);
        foreach ($ids as $_) {
            $g->drawFromAnimalDeckFor($currentPlayerId);
        }

        $g->notifyAllWithBoardState(
            'mulliganHand',
            clienttranslate('${player_name} mulligans ${discard_count} card(s)'),
            [
                'player_id' => $currentPlayerId,
                'player_name' => $g->getPlayerNameById($currentPlayerId),
                'discard_count' => count($ids),
            ],
            [
                $currentPlayerId => ['discarded' => $ids],
            ]
        );

        $g->recordOpeningMulliganStats($currentPlayerId, count($ids));

        $finished = $this->game->gamestate->setPlayerNonMultiactive($currentPlayerId, Gameplay::class);
        if ($finished) {
            $this->game->gamestate->changeActivePlayer($this->game->getRoundLeaderId());
        }

        return null;
    }

    public function zombie(int $playerId)
    {
        return $this->actMulliganHand('[]', $playerId, $this->getArgs());
    }
}
