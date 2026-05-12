-- Animal, objective, and scoring cards use the same `card` table with different `card_location` prefixes.

CREATE TABLE IF NOT EXISTS `card` (
  `card_id` int unsigned NOT NULL AUTO_INCREMENT,
  `card_type` varchar(16) NOT NULL,
  `card_type_arg` int NOT NULL,
  `card_location` varchar(32) NOT NULL,
  `card_location_arg` int NOT NULL,
  PRIMARY KEY (`card_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 AUTO_INCREMENT=1;
